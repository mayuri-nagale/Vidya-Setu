import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";
import { upsertNotifications } from "../../../../lib/notifications";

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const downloads = await db.collection("downloads").find({ studentId }).sort({ updatedAt: -1 }).toArray();
  return NextResponse.json({ downloads: downloads.map((item) => ({ ...item, _id: item._id.toString(), lectureId: item.lectureId.toString(), fileId: item.fileId.toString() })) });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, fileId, progress = 0, completed = false, bytesReceived = 0, cached = false } = await request.json();
  if (![lectureId, fileId].every(Boolean) || !ObjectId.isValid(lectureId) || !ObjectId.isValid(fileId)) return NextResponse.json({ error: "Invalid download." }, { status: 400 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  const lecture = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), assignedStandards: student?.standard, assignedDivisions: student?.division, "resources.fileId": new ObjectId(fileId) });
  if (!lecture) return NextResponse.json({ error: "File is not assigned to this student." }, { status: 403 });
  const resource = lecture.resources?.find((item) => item.fileId?.toString() === fileId);
  const expectedBytes = Math.max(0, Number(resource?.size || 0));
  const requestedBytes = Math.max(0, Math.min(expectedBytes || Number(bytesReceived) || 0, Number(bytesReceived) || 0));
  const existing = await db.collection("downloads").findOne({ studentId, fileId: new ObjectId(fileId) });
  const safeBytes = Math.max(Number(existing?.bytesReceived || 0), requestedBytes);
  const isComplete = Boolean(existing?.completed) || (Boolean(completed) && (!expectedBytes || safeBytes >= expectedBytes));
  const update = { studentId, lectureId: lecture._id, lectureVersion: Number(lecture.version || 1), lectureVersionId: lecture.versionId || null, resourceVersion: Number(resource?.version || lecture.version || 1), resourceVersionId: resource?.versionId || lecture.versionId || null, fileId: new ObjectId(fileId), filename: resource?.filename || "Resource", progress: expectedBytes ? Math.round((safeBytes / expectedBytes) * 100) : Math.max(0, Math.min(100, Number(progress) || 0)), bytesReceived: safeBytes, totalBytes: expectedBytes, completed: isComplete, cached: isComplete ? Boolean(cached) : false, updatedAt: new Date() };
  await db.collection("downloads").updateOne({ studentId, fileId: new ObjectId(fileId) }, { $set: update, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  if (update.completed) {
    await upsertNotifications(db, [{
      eventKey: `download:${studentId}:${fileId}:completed`,
      recipientRole: "student",
      recipientId: studentId,
      type: "download_complete",
      title: `${update.filename} downloaded`,
      detail: `${lecture.title} is ready in your offline library.`,
      lectureId,
      createdAt: update.updatedAt,
    }]);
  }
  return NextResponse.json({ download: { ...update, lectureId, fileId } });
}
