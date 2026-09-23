import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";
import { upsertNotifications } from "../../../../lib/notifications";
import { boundedText } from "../../../../lib/security";

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const doubts = await db.collection("doubts").find({ studentId }).sort({ createdAt: -1 }).toArray();
  const unreadReplies = doubts.filter((doubt) => doubt.replies?.length && (!doubt.studentRepliesReadAt || new Date(doubt.studentRepliesReadAt) < new Date(doubt.replies.at(-1).createdAt))).length;
  return NextResponse.json({ unreadReplies, doubts: doubts.map((doubt) => ({ ...doubt, _id: doubt._id.toString(), lectureId: doubt.lectureId.toString() })) });
}

export async function PATCH() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  await db.collection("doubts").updateMany({ studentId, "replies.0": { $exists: true } }, { $set: { studentRepliesReadAt: new Date() } });
  return NextResponse.json({ ok: true });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (!body.lectureId) return NextResponse.json({ error: "Lecture and doubt are required." }, { status: 400 });
  let question;
  try { question = boundedText(body.question, { field: "Doubt", min: 1, max: 2000 }); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!ObjectId.isValid(body.lectureId)) return NextResponse.json({ error: "Invalid lecture." }, { status: 400 });
  const lecture = await db.collection("lectures").findOne({ _id: new ObjectId(body.lectureId), assignedStandards: student?.standard, assignedDivisions: student?.division });
  if (!lecture) return NextResponse.json({ error: "Lecture is not assigned to this student." }, { status: 403 });
  const clientSyncId = String(body.clientSyncId || "").trim().slice(0, 128);
  if (clientSyncId) {
    const existing = await db.collection("doubts").findOne({ studentId, clientSyncId });
    if (existing) return NextResponse.json({ doubt: { ...existing, _id: existing._id.toString(), lectureId: existing.lectureId.toString() } });
  }
  const timestampSeconds = Math.max(0, Math.min(24 * 60 * 60, Number(body.timestampSeconds) || 0));
  const pageNumber = body.pageNumber ? Math.max(1, Math.min(10000, Number(body.pageNumber) || 1)) : null;
  const doubt = { studentId, studentName: student.name, lectureId: lecture._id, lectureVersion: Number(lecture.version || 1), lectureVersionId: lecture.versionId || null, teacherId: lecture.teacherId, title: lecture.title, chapter: lecture.chapter, question, timestampSeconds, pageNumber, status: "open", replies: [], ...(clientSyncId ? { clientSyncId } : {}), createdAt: new Date() };
  let result;
  try {
    result = await db.collection("doubts").insertOne(doubt);
  } catch (error) {
    if (clientSyncId && error?.code === 11000) {
      const existing = await db.collection("doubts").findOne({ studentId, clientSyncId });
      if (existing) return NextResponse.json({ doubt: { ...existing, _id: existing._id.toString(), lectureId: existing.lectureId.toString() } });
    }
    throw error;
  }
  await upsertNotifications(db, [{
    eventKey: `doubt:${result.insertedId}:teacher`,
    recipientRole: "teacher",
    recipientId: lecture.teacherId,
    type: "doubt",
    title: `${student.name} asked a doubt`,
    detail: `${lecture.title}: ${doubt.question}`,
    lectureId: lecture._id.toString(),
    doubtId: result.insertedId.toString(),
    createdAt: doubt.createdAt,
  }]);
  return NextResponse.json({ doubt: { ...doubt, _id: result.insertedId.toString(), lectureId: lecture._id.toString() } }, { status: 201 });
}
