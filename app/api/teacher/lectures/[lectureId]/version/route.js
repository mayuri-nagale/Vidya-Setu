import { ObjectId, GridFSBucket } from "mongodb";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../../../lib/auth";

export async function POST(request, { params }) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId } = await params;
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid lecture" }, { status: 400 });

  const db = await getDb();
  const existing = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), teacherId });
  if (!existing) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
  const form = await request.formData();
  const changes = String(form.get("changes") || "").trim();
  const resourceType = String(form.get("resourceType") || "").trim();
  const file = form.get("file");
  const update = { version: (existing.version || 1) + 1, updatedAt: new Date(), versionChanges: [...(existing.versionChanges || []), { version: (existing.version || 1) + 1, changes, createdAt: new Date() }] };

  if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
    const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(file.name, { metadata: { teacherId, subject: existing.subject, chapter: existing.chapter, kind: resourceType || "resource" } });
      upload.on("error", reject);
      upload.on("finish", () => resolve(upload.id));
      upload.end(bytes);
    });
    update.resources = [...(existing.resources || []), { kind: resourceType || "resource", filename: file.name, mimeType: file.type, size: file.size, checksum, fileId }];
  }

  await db.collection("lectures").updateOne({ _id: existing._id }, { $set: update });
  return NextResponse.json({ lecture: { ...existing, ...update, _id: existing._id.toString() } });
}
