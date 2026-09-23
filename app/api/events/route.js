import { getDb } from "../../../lib/mongodb";
import { getCurrentStudentId, getCurrentTeacherId } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const encoder = new TextEncoder();

function timestamp(value) {
  return value ? new Date(value).getTime() : 0;
}

async function getStudentFingerprint(db, studentId) {
  const student = await db.collection("students").findOne({ studentId }, { projection: { standard: 1, division: 1 } });
  if (!student) return "missing";
  const [lecture, doubt, download, attempt, reminder] = await Promise.all([
    db.collection("lectures").find({ assignedStandards: student.standard, assignedDivisions: student.division }).sort({ updatedAt: -1 }).limit(1).next(),
    db.collection("doubts").find({ studentId }).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next(),
    db.collection("downloads").find({ studentId }).sort({ updatedAt: -1 }).limit(1).next(),
    db.collection("quizAttempts").find({ studentId }).sort({ submittedAt: -1 }).limit(1).next(),
    db.collection("lectureReminders").find({ studentIds: studentId }).sort({ sentAt: -1 }).limit(1).next(),
  ]);
  return JSON.stringify([timestamp(lecture?.updatedAt), timestamp(doubt?.updatedAt || doubt?.createdAt), timestamp(download?.updatedAt), timestamp(attempt?.submittedAt), timestamp(reminder?.updatedAt || reminder?.sentAt)]);
}

async function getTeacherFingerprint(db, teacherId) {
  const [lecture, doubt, attempt] = await Promise.all([
    db.collection("lectures").find({ teacherId }).sort({ updatedAt: -1 }).limit(1).next(),
    db.collection("doubts").find({ teacherId }).sort({ updatedAt: -1, createdAt: -1 }).limit(1).next(),
    db.collection("quizAttempts").find({ teacherId }).sort({ submittedAt: -1 }).limit(1).next(),
  ]);
  return JSON.stringify([timestamp(lecture?.updatedAt), timestamp(doubt?.updatedAt || doubt?.createdAt), timestamp(attempt?.submittedAt)]);
}

export async function GET(request) {
  const [studentId, teacherId] = await Promise.all([getCurrentStudentId(), getCurrentTeacherId()]);
  if (!studentId && !teacherId) return new Response("Unauthorized", { status: 401 });

  const db = await getDb();
  let stop = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let previous = "";
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
      };
      const send = (event, data) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const poll = async () => {
        if (closed) return;
        try {
          const fingerprint = studentId ? await getStudentFingerprint(db, studentId) : await getTeacherFingerprint(db, teacherId);
          if (fingerprint !== previous) {
            previous = fingerprint;
            send("content", { changedAt: Date.now() });
          }
        } catch {
          send("error", { message: "Live updates temporarily unavailable." });
        }
      };
      const interval = setInterval(poll, 2000);
      stop = close;
      request.signal.addEventListener("abort", close, { once: true });
      send("connected", { role: studentId ? "student" : "teacher" });
      poll();
    },
    cancel() { stop(); },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
