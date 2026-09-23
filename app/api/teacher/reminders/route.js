import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";
import { upsertNotifications } from "../../../../lib/notifications";
import { boundedText } from "../../../../lib/security";

export async function POST(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, studentIds = [], message } = await request.json();
  if (!lectureId || !Array.isArray(studentIds) || !studentIds.length || studentIds.length > 200) return NextResponse.json({ error: "Lecture and students are required." }, { status: 400 });
  const db = await getDb();
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid lecture." }, { status: 400 });
  const lectureObjectId = new ObjectId(lectureId);
  const lecture = await db.collection("lectures").findOne({ _id: lectureObjectId, teacherId });
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const allowedStudents = await db.collection("students").find({
    studentId: { $in: studentIds.map((id) => String(id)) },
    standard: { $in: lecture.assignedStandards || [] },
    division: { $in: lecture.assignedDivisions || [] },
  }, { projection: { studentId: 1 } }).toArray();
  const recipients = [...new Set(allowedStudents.map((student) => student.studentId))];
  if (!recipients.length) return NextResponse.json({ error: "No selected students are assigned to this lecture." }, { status: 400 });
  let safeMessage;
  try { safeMessage = boundedText(message || `Please complete ${lecture.title} and review the latest resources.`, { field: "Reminder", min: 1, max: 1000 }); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const now = new Date();
  await db.collection("lectureReminders").updateOne(
    { teacherId, lectureId: lectureObjectId, version: lecture.version },
    { $set: { teacherId, lectureId: lectureObjectId, version: lecture.version, studentIds: recipients, message: safeMessage, sentAt: now, updatedAt: now } },
    { upsert: true },
  );
  await upsertNotifications(
    db,
    recipients.map((studentId) => ({
      eventKey: `reminder:${lectureId}:${lecture.version}:${now.getTime()}:${studentId}`,
      recipientRole: "student",
      recipientId: studentId,
      type: "reminder",
      title: `Reminder from mam: ${lecture.title}`,
      detail: safeMessage,
      lectureId,
      version: lecture.version,
      createdAt: now,
    })),
  );
  return NextResponse.json({ ok: true, sent: recipients.length, version: lecture.version });
}
