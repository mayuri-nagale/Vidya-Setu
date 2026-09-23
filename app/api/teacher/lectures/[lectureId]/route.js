import { GridFSBucket, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getCurrentTeacherId } from "../../../../../lib/auth";
import { getDb } from "../../../../../lib/mongodb";
import { getAssignedStudentIds, upsertNotifications } from "../../../../../lib/notifications";

export async function DELETE(_request, { params }) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lectureId } = await params;
  if (!ObjectId.isValid(lectureId)) {
    return NextResponse.json({ error: "Invalid lecture." }, { status: 400 });
  }

  const db = await getDb();
  const lectureObjectId = new ObjectId(lectureId);
  const lecture = await db.collection("lectures").findOne({ _id: lectureObjectId, teacherId });
  if (!lecture) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });

  const studentIds = await getAssignedStudentIds(
    db,
    lecture.assignedStandards,
    lecture.assignedDivisions,
  );
  const result = await db.collection("lectures").deleteOne({ _id: lectureObjectId, teacherId });
  if (!result.deletedCount) {
    return NextResponse.json({ error: "Lecture could not be deleted." }, { status: 409 });
  }

  const fileIds = [...new Map((lecture.resources || [])
    .filter((resource) => resource.fileId)
    .map((resource) => [resource.fileId.toString(), resource.fileId])).values()];
  const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });

  await Promise.allSettled([
    ...fileIds.map((fileId) => bucket.delete(fileId)),
    db.collection("downloads").deleteMany({ lectureId: lectureObjectId }),
    db.collection("doubts").deleteMany({ lectureId: lectureObjectId }),
    db.collection("quizAttempts").deleteMany({ lectureId: lectureObjectId }),
    db.collection("lectureReminders").deleteMany({ lectureId: lectureObjectId }),
    db.collection("nearbyShares").deleteMany({ lectureId: lectureObjectId }),
    db.collection("notifications").deleteMany({ lectureId: { $in: [lectureId, lectureObjectId] } }),
  ]);

  await upsertNotifications(db, studentIds.map((studentId) => ({
    eventKey: `lecture:${lectureId}:deleted:${studentId}`,
    recipientRole: "student",
    recipientId: studentId,
    type: "content_removed",
    title: "A lecture was removed",
    detail: `${lecture.title} is no longer available.`,
    lectureId,
    createdAt: new Date(),
  })));

  return NextResponse.json({ deleted: true, lectureId });
}
