import { NextResponse } from "next/server";
import { GridFSBucket } from "mongodb";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";
import { getAssignedStudentIds, upsertNotifications } from "../../../../lib/notifications";
import { readLectureFields, validateQuiz, validateUpload } from "../../../../lib/validation";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const lectures = await db.collection("lectures").find({ teacherId }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({ lectures: lectures.map((lecture) => ({ ...lecture, _id: lecture._id.toString(), resources: (lecture.resources || []).map((resource) => ({ ...resource, fileId: resource.fileId?.toString() })) })) });
}

export async function POST(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  let fields;
  let quiz;
  try {
    fields = readLectureFields(form);
    quiz = validateQuiz(JSON.parse(String(form.get("quiz") || "[]")));
  } catch (error) {
    return NextResponse.json({ error: error.message || "Invalid lecture data." }, { status: 400 });
  }
  const { title, subject, chapter, assignedStandard, assignedDivision, description } = fields;

  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
  const resources = [];
  const uploadedIds = [];
  try {
  for (const field of ["video", "ppt", "pdf"]) {
    const file = form.get(field);
    const validFile = validateUpload(file, field);
    if (!validFile) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(validFile.name, { metadata: { teacherId, subject, chapter, kind: field } });
      upload.on("error", reject);
      upload.on("finish", () => resolve(upload.id));
      upload.end(bytes);
    });
    uploadedIds.push(fileId);
    resources.push({ kind: field, filename: validFile.name, mimeType: validFile.type, size: validFile.size, checksum, fileId });
  }
  } catch (error) {
    await Promise.allSettled(uploadedIds.map((fileId) => bucket.delete(fileId)));
    return NextResponse.json({ error: error.message || "File upload failed." }, { status: 400 });
  }
  const lecture = {
    lectureId: `lec_${randomUUID().replaceAll("-", "").slice(0, 8)}`,
    teacherId,
    assignedStandards: [assignedStandard],
    assignedDivisions: [assignedDivision],
    subject,
    chapter,
    title,
    description,
    quiz,
    resources,
    version: 1,
    versionId: `v_${randomUUID().replaceAll("-", "").slice(0, 10)}`,
    status: "Published",
    verification: "Verified",
    publishedAt: new Date(),
    versionHistory: [],
    corrections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let result;
  try {
    result = await db.collection("lectures").insertOne(lecture);
  } catch (error) {
    await Promise.allSettled(uploadedIds.map((fileId) => bucket.delete(fileId)));
    throw error;
  }
  const lectureId = result.insertedId.toString();
  const studentIds = await getAssignedStudentIds(
    db,
    lecture.assignedStandards,
    lecture.assignedDivisions,
  );
  try { await upsertNotifications(
    db,
    studentIds.map((studentId) => ({
      eventKey: `lecture:${lectureId}:published:${studentId}`,
      recipientRole: "student",
      recipientId: studentId,
      type: "new_content",
      title: `New lesson: ${lecture.title}`,
      detail: `${lecture.subject} · ${lecture.chapter} · ${resources.length} resource${resources.length === 1 ? "" : "s"} added`,
      lectureId,
      version: lecture.version,
    })),
  ); } catch (error) { console.error("Lecture notification creation failed", error); }
  return NextResponse.json({ lecture: { ...lecture, _id: result.insertedId } }, { status: 201 });
}
