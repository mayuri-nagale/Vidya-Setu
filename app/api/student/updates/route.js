import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";

function updateTime(value) {
  return value ? new Date(value).getTime() : 0;
}

const NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const since = new Date(Date.now() - NOTIFICATION_MAX_AGE_MS);
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const savedUpdates = await db.collection("notifications")
    .find({ recipientRole: "student", recipientId: studentId, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  const [lectures, reminders, downloads, doubts] = await Promise.all([
    db.collection("lectures").find({ assignedStandards: student.standard, assignedDivisions: student.division }).sort({ updatedAt: -1 }).toArray(),
    db.collection("lectureReminders").find({ studentIds: studentId, sentAt: { $gte: since } }).sort({ sentAt: -1 }).toArray(),
    db.collection("downloads").find({ studentId, completed: true, updatedAt: { $gte: since } }).sort({ updatedAt: -1 }).limit(20).toArray(),
    db.collection("doubts").find({ studentId }).sort({ updatedAt: -1 }).toArray(),
  ]);
  const lectureMap = new Map(lectures.map((lecture) => [lecture._id.toString(), lecture]));
  const updates = [];

  lectures.forEach((lecture) => {
    const lectureId = lecture._id.toString();
    updates.push({
      id: `lecture-${lectureId}`,
      type: "new_content",
      title: `New lesson: ${lecture.title}`,
      detail: `${lecture.subject || "Subject"} · ${lecture.chapter || "Chapter"} · ${(lecture.resources || []).length} resource${(lecture.resources || []).length === 1 ? "" : "s"} added`,
      createdAt: lecture.publishedAt || lecture.createdAt,
      lectureId,
    });
    (lecture.versionChanges || []).forEach((change, index) => updates.push({
      id: `version-${lectureId}-${change.version || index}`,
      type: "content_updated",
      title: `${lecture.title} was updated`,
      detail: change.summaryNote || change.changes || `Version ${change.version} is available now.`,
      createdAt: change.createdAt || lecture.updatedAt,
      lectureId,
      version: change.version,
    }));
  });

  reminders.forEach((reminder) => {
    const lecture = lectureMap.get(reminder.lectureId.toString());
    updates.push({
      id: `reminder-${reminder._id.toString()}`,
      type: "reminder",
      title: `Reminder from mam: ${lecture?.title || "Complete your lesson"}`,
      detail: reminder.message || `Please complete ${lecture?.chapter || "this lesson"} and check the latest resources.`,
      createdAt: reminder.sentAt,
      lectureId: lecture?._id.toString(),
      version: reminder.version,
    });
  });

  downloads.forEach((download) => {
    const lecture = lectureMap.get(download.lectureId.toString());
    updates.push({
      id: `download-${download._id.toString()}`,
      type: "download_complete",
      title: `${download.filename} downloaded`,
      detail: `${lecture?.title || "Resource"} is ready in your offline library.`,
      createdAt: download.updatedAt || download.createdAt,
      lectureId: lecture?._id.toString(),
    });
  });

  doubts.forEach((doubt) => {
    const latestReply = doubt.replies?.at(-1);
    if (!latestReply || latestReply.from !== "teacher") return;
    updates.push({
      id: `reply-${doubt._id.toString()}-${updateTime(latestReply.createdAt)}`,
      type: "doubt_reply",
      title: `Mam replied to your doubt in ${doubt.title}`,
      detail: latestReply.text,
      createdAt: latestReply.createdAt,
      lectureId: doubt.lectureId?.toString(),
    });
  });

  const saved = savedUpdates.map((update) => ({
    id: update.eventKey, type: update.type, title: update.title, detail: update.detail,
    createdAt: update.createdAt, lectureId: update.lectureId, version: update.version,
  }));
  const unique = new Map();
  [...saved, ...updates].forEach((update) => {
    if (!unique.has(update.id)) unique.set(update.id, update);
  });
  const combined = [...unique.values()].filter((update) => updateTime(update.createdAt) >= since.getTime()).sort((first, second) => updateTime(second.createdAt) - updateTime(first.createdAt));
  return NextResponse.json({ updates: combined.slice(0, 50), hasMore: combined.length > 50 });
}
