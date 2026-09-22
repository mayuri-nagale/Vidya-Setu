import { NextResponse } from "next/server";
import { GridFSBucket } from "mongodb";
import { createHash } from "node:crypto";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

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
  const title = String(form.get("title") || "").trim();
  const subject = String(form.get("subject") || "").trim();
  const chapter = String(form.get("chapter") || "").trim();
  const assignedStandard = String(form.get("assignedStandard") || "").trim();
  const assignedDivision = String(form.get("assignedDivision") || "").trim();
  if (!title || !subject || !chapter || !assignedStandard || !assignedDivision) {
    return NextResponse.json({ error: "Title, subject, chapter, standard and division are required." }, { status: 400 });
  }

  const db = await getDb();
  const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
  const resources = [];
  for (const field of ["video", "ppt", "pdf"]) {
    const file = form.get(field);
    if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(file.name, { metadata: { teacherId, subject, chapter, kind: field } });
      upload.on("error", reject);
      upload.on("finish", () => resolve(upload.id));
      upload.end(bytes);
    });
    resources.push({ kind: field, filename: file.name, mimeType: file.type, size: file.size, checksum, fileId });
  }

  let quiz = [];
  try { quiz = JSON.parse(String(form.get("quiz") || "[]")); } catch { return NextResponse.json({ error: "Quiz data is invalid." }, { status: 400 }); }
  if (!Array.isArray(quiz)) return NextResponse.json({ error: "Quiz data is invalid." }, { status: 400 });
  const lecture = {
    teacherId,
    assignedStandards: [assignedStandard],
    assignedDivisions: [assignedDivision],
    subject,
    chapter,
    title,
    description: String(form.get("description") || "").trim(),
    quiz,
    resources,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection("lectures").insertOne(lecture);
  return NextResponse.json({ lecture: { ...lecture, _id: result.insertedId } }, { status: 201 });
}
