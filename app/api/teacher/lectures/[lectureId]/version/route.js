import { ObjectId, GridFSBucket } from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "../../../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../../../lib/auth";
import { getAssignedStudentIds, upsertNotifications } from "../../../../../../lib/notifications";
import { validateUpload } from "../../../../../../lib/validation";

export async function POST(request, { params }) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId } = await params;
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid lecture" }, { status: 400 });

  const db = await getDb();
  const existing = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), teacherId });
  if (!existing) return NextResponse.json({ error: "Lecture not found" }, { status: 404 });
  const form = await request.formData();
  const changes = String(form.get("changes") || "").trim().slice(0, 2000);
  const correctionTimestamp = String(form.get("correctionTimestamp") || changes.match(/^\[?(\d{1,2}:\d{2})\]?/)?.[1] || "").trim();
  const summaryNote = String(form.get("summaryNote") || changes.replace(/^\[?\d{1,2}:\d{2}\]?\s*[-:]?\s*/, "").trim()).trim();
  const resourceType = String(form.get("resourceType") || "").trim();
  const file = form.get("file");
  if (!changes) return NextResponse.json({ error: "Please describe what was corrected." }, { status: 400 });
  const now = new Date();
  const nextVersion = (existing.version || 1) + 1;
  const versionId = `v_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const versionEntry = { version: nextVersion, versionId, changes: correctionTimestamp ? `[${correctionTimestamp}] ${changes}` : changes, correctionTimestamp, summaryNote, createdAt: now };
  const update = {
    version: nextVersion,
    versionId,
    status: "Published",
    verification: "Verified",
    updatedAt: now,
    publishedAt: now,
    versionChanges: [...(existing.versionChanges || []), versionEntry],
    versionHistory: [...(existing.versionHistory || []), { version: existing.version || 1, versionId: existing.versionId, status: existing.status || "Published", verification: existing.verification || "Verified", createdAt: existing.updatedAt || existing.createdAt }].filter((entry) => entry.versionId),
    corrections: [...(existing.corrections || []), { version: nextVersion, versionId, timestamp: correctionTimestamp, note: summaryNote || changes, createdAt: now }],
  };

  let uploadedFileId = null;
  try {
  if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
    const validFile = validateUpload(file, resourceType || "pdf");
    const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
    const bytes = Buffer.from(await file.arrayBuffer());
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const fileId = await new Promise((resolve, reject) => {
      const upload = bucket.openUploadStream(file.name, { metadata: { teacherId, subject: existing.subject, chapter: existing.chapter, kind: resourceType || "resource" } });
      upload.on("error", reject);
      upload.on("finish", () => resolve(upload.id));
      upload.end(bytes);
    });
    uploadedFileId = fileId;
    update.resources = [...(existing.resources || []), { kind: resourceType || "pdf", filename: validFile.name, mimeType: validFile.type, size: validFile.size, checksum, fileId, version: nextVersion, versionId }];
  }
  } catch (error) {
    return NextResponse.json({ error: error.message || "Resource update failed." }, { status: 400 });
  }

  const write = await db.collection("lectures").updateOne({ _id: existing._id, teacherId, version: existing.version || 1 }, { $set: update });
  if (!write.matchedCount) {
    if (uploadedFileId) await new GridFSBucket(db, { bucketName: "lectureFiles" }).delete(uploadedFileId).catch(() => {});
    return NextResponse.json({ error: "This lecture changed in another tab. Refresh and try again." }, { status: 409 });
  }
  const studentIds = await getAssignedStudentIds(
    db,
    existing.assignedStandards,
    existing.assignedDivisions,
  );
  try { await upsertNotifications(
    db,
    studentIds.map((studentId) => ({
      eventKey: `lecture:${existing._id}:version:${nextVersion}:${studentId}`,
      recipientRole: "student",
      recipientId: studentId,
      type: "content_updated",
      title: `${existing.title} was updated`,
      detail: summaryNote || changes,
      lectureId: existing._id.toString(),
      version: nextVersion,
    })),
  ); } catch (error) { console.error("Version notification creation failed", error); }
  return NextResponse.json({ lecture: { ...existing, ...update, _id: existing._id.toString() } });
}
