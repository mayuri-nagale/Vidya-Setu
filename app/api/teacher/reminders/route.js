import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";
import { upsertNotifications } from "../../../../lib/notifications";

export async function POST(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, studentIds = [], message } = await request.json();
  if (!lectureId || !Array.isArray(studentIds) || !studentIds.length) return NextResponse.json({ error: "Lecture and students are required." }, { status: 400 });
  const db = await getDb();
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid lecture." }, { status: 400 });
  const lectureObjectId = new ObjectId(lectureId);
  const lecture = await db.collection("lectures").findOne({ _id: lectureObjectId, teacherId });
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const now = new Date();
  await db.collection("lectureReminders").updateOne(
    { teacherId, lectureId: lectureObjectId, version: lecture.version },
    { $set: { teacherId, lectureId: lectureObjectId, version: lecture.version, studentIds, message: String(message || `Please complete ${lecture.title} and review the latest resources.`).trim(), sentAt: now, updatedAt: now } },
    { upsert: true },
  );
  await upsertNotifications(
    db,
    studentIds.map((studentId) => ({
      eventKey: `reminder:${lectureId}:${lecture.version}:${now.getTime()}:${studentId}`,
      recipientRole: "student",
      recipientId: studentId,
      type: "reminder",
      title: `Reminder from mam: ${lecture.title}`,
      detail: String(message || `Please complete ${lecture.title} and review the latest resources.`).trim(),
      lectureId,
      version: lecture.version,
      createdAt: now,
    })),
  );
  return NextResponse.json({ ok: true, sent: studentIds.length, version: lecture.version });
}
