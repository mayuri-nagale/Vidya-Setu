import { ObjectId, GridFSBucket } from "mongodb";
import { getDb } from "../../../../../lib/mongodb";
import { getCurrentTeacherId, getCurrentStudentId } from "../../../../../lib/auth";

export async function GET(request, { params }) {
  const teacherId = await getCurrentTeacherId();
  const studentId = await getCurrentStudentId();
  if (!teacherId && !studentId) return new Response("Unauthorized", { status: 401 });

  const { fileId } = await params;
  if (!ObjectId.isValid(fileId)) return new Response("Invalid file", { status: 400 });
  const db = await getDb();
  const file = await db.collection("lectureFiles.files").findOne({ _id: new ObjectId(fileId), ...(teacherId ? { "metadata.teacherId": teacherId } : {}) });
  if (!file) return new Response("File not found", { status: 404 });
  if (studentId) {
    const student = await db.collection("students").findOne({ studentId });
    const lecture = await db.collection("lectures").findOne({ "resources.fileId": new ObjectId(fileId), assignedStandards: student?.standard, assignedDivisions: student?.division });
    if (!lecture) return new Response("File not assigned to this student", { status: 403 });
  }

  const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
  const range = request.headers.get("range");
  const match = range?.match(/^bytes=(\d+)-(\d*)$/);
  if (range && !match) return new Response("Invalid byte range", { status: 416, headers: { "Content-Range": `bytes */${file.length}` } });
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : file.length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.length) {
    return new Response("Requested range is not available", { status: 416, headers: { "Content-Range": `bytes */${file.length}` } });
  }
  const stream = range ? bucket.openDownloadStream(file._id, { start, end: Math.min(end + 1, file.length) }) : bucket.openDownloadStream(file._id);
  return new Response(stream, { status: range ? 206 : 200, headers: { "Content-Type": file.contentType || file.metadata?.mimeType || "application/octet-stream", "Content-Length": String(range ? Math.max(0, Math.min(end + 1, file.length) - start) : file.length), "Accept-Ranges": "bytes", ...(range ? { "Content-Range": `bytes ${start}-${Math.min(end, file.length - 1)}/${file.length}` } : {}), "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"` } });
}
