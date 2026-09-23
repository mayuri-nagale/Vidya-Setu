import crypto from "node:crypto";
import { GridFSBucket, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";
import { allowRateLimit, clientKey } from "../../../../lib/security";

const SHARE_LIFETIME_MS = 10 * 60 * 1000;
const MAX_SIGNAL_BYTES = 32 * 1024;
const MAX_CANDIDATES_PER_SIDE = 64;

function normalizeCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function publicShare(share) {
  return {
    shareCode: share.shareCode,
    state: share.state,
    resource: share.resource,
    senderCandidates: share.senderCandidates || [],
    receiverCandidates: share.receiverCandidates || [],
    offer: share.offer || null,
    answer: share.answer || null,
    expiresAt: share.expiresAt,
  };
}

async function getStudent(db, studentId) {
  return db.collection("students").findOne({ studentId }, { projection: { standard: 1, division: 1, name: 1 } });
}

async function getAssignedResource(db, student, lectureId, fileId) {
  if (!ObjectId.isValid(lectureId) || !ObjectId.isValid(fileId)) return null;
  const lecture = await db.collection("lectures").findOne({
    _id: new ObjectId(lectureId),
    assignedStandards: student.standard,
    assignedDivisions: student.division,
    "resources.fileId": new ObjectId(fileId),
  });
  if (!lecture) return null;
  const resource = lecture.resources?.find((item) => item.fileId?.toString() === fileId);
  if (!resource) return null;
  if (resource.checksum) return { lecture, resource };

  const hash = crypto.createHash("sha256");
  const bucket = new GridFSBucket(db, { bucketName: "lectureFiles" });
  await new Promise((resolve, reject) => {
    const stream = bucket.openDownloadStream(resource.fileId);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const checksum = hash.digest("hex");
  await db.collection("lectures").updateOne(
    { _id: lecture._id, "resources.fileId": resource.fileId },
    { $set: { "resources.$.checksum": checksum } },
  );
  return { lecture, resource: { ...resource, checksum } };
}

async function getAccessibleShare(db, studentId, code) {
  const share = await db.collection("nearbyShares").findOne({ shareCode: code });
  if (!share) return { error: "Share code not found." };
  if (new Date(share.expiresAt) <= new Date()) return { error: "This share code has expired.", status: 410 };
  if (share.senderId !== studentId && share.recipientId !== studentId) return { error: "This transfer is not assigned to your account.", status: 403 };
  return { share };
}

export async function GET(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = normalizeCode(new URL(request.url).searchParams.get("code"));
  if (code.length !== 6) return NextResponse.json({ error: "Enter a six-digit share code." }, { status: 400 });
  const result = await getAccessibleShare(await getDb(), studentId, code);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status || 404 });
  return NextResponse.json({ share: publicShare(result.share) });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const rate = allowRateLimit(clientKey(request, `nearby:${studentId}`), { limit: body.action === "signal" ? 180 : 30, windowMs: 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many nearby-share requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });
  const db = await getDb();
  const action = body.action;

  if (action === "create") {
    const student = await getStudent(db, studentId);
    const assigned = student && await getAssignedResource(db, student, String(body.lectureId || ""), String(body.fileId || ""));
    if (!assigned) return NextResponse.json({ error: "You can only share a resource assigned to your class." }, { status: 403 });

    let shareCode;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      shareCode = crypto.randomInt(100000, 1000000).toString();
      if (!(await db.collection("nearbyShares").findOne({ shareCode }))) break;
    }
    const now = new Date();
    const share = {
      shareCode,
      senderId: studentId,
      recipientId: null,
      state: "waiting",
      lectureId: assigned.lecture._id,
      resource: {
        lectureId: assigned.lecture._id.toString(),
        fileId: assigned.resource.fileId.toString(),
        title: assigned.lecture.title,
        chapter: assigned.lecture.chapter,
        filename: assigned.resource.filename,
        mimeType: assigned.resource.mimeType || "application/octet-stream",
        size: assigned.resource.size,
        checksum: assigned.resource.checksum || null,
      },
      offer: null,
      answer: null,
      senderCandidates: [],
      receiverCandidates: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + SHARE_LIFETIME_MS),
    };
    try {
      await db.collection("nearbyShares").insertOne(share);
    } catch (error) {
      if (error?.code === 11000) return NextResponse.json({ error: "Could not create a pairing code. Please try again." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ share: publicShare(share) }, { status: 201 });
  }

  const code = normalizeCode(body.shareCode);
  if (code.length !== 6) return NextResponse.json({ error: "Enter a six-digit share code." }, { status: 400 });

  if (action === "join") {
    const share = await db.collection("nearbyShares").findOne({ shareCode: code });
    if (!share || new Date(share.expiresAt) <= new Date()) return NextResponse.json({ error: "Share code not found or expired." }, { status: 404 });
    if (share.senderId === studentId) return NextResponse.json({ error: "Use this code on a classmate's device." }, { status: 400 });
    if (share.recipientId && share.recipientId !== studentId) return NextResponse.json({ error: "This code is already being used by another student." }, { status: 409 });
    const student = await getStudent(db, studentId);
    const assigned = student && await getAssignedResource(db, student, share.resource.lectureId, share.resource.fileId);
    if (!assigned) return NextResponse.json({ error: "This resource is not assigned to your class." }, { status: 403 });
    await db.collection("nearbyShares").updateOne({ _id: share._id }, { $set: { recipientId: studentId, state: "connecting", updatedAt: new Date() } });
    return NextResponse.json({ share: publicShare({ ...share, recipientId: studentId, state: "connecting" }) });
  }

  const access = await getAccessibleShare(db, studentId, code);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status || 404 });
  const isSender = access.share.senderId === studentId;

  if (action === "cancel") {
    if (!isSender) return NextResponse.json({ error: "Only the sender can cancel this transfer." }, { status: 403 });
    await db.collection("nearbyShares").deleteOne({ _id: access.share._id, senderId: studentId });
    return NextResponse.json({ ok: true });
  }

  if (action === "signal") {
    const signalType = body.signalType;
    if ((signalType === "offer" && !isSender) || (signalType === "answer" && isSender)) return NextResponse.json({ error: "Invalid transfer signal." }, { status: 403 });
    if (!["offer", "answer", "candidate"].includes(signalType)) return NextResponse.json({ error: "Invalid transfer signal." }, { status: 400 });
    if (JSON.stringify(body.signal || "").length > MAX_SIGNAL_BYTES) return NextResponse.json({ error: "Transfer signal is too large." }, { status: 413 });
    const update = { updatedAt: new Date(), state: "connecting" };
    if (signalType === "offer") update.offer = body.signal;
    if (signalType === "answer") update.answer = body.signal;
    if (signalType === "candidate") {
      if (!body.signal?.candidate) return NextResponse.json({ error: "Invalid ICE candidate." }, { status: 400 });
      const field = isSender ? "senderCandidates" : "receiverCandidates";
      if ((access.share[field] || []).length >= MAX_CANDIDATES_PER_SIDE) return NextResponse.json({ error: "Too many transfer signals. Pair again." }, { status: 429 });
      await db.collection("nearbyShares").updateOne({ _id: access.share._id }, { $push: { [field]: { $each: [body.signal], $slice: -MAX_CANDIDATES_PER_SIDE } }, $set: update });
      return NextResponse.json({ ok: true });
    }
    await db.collection("nearbyShares").updateOne({ _id: access.share._id }, { $set: update });
    return NextResponse.json({ ok: true });
  }

  if (action === "complete") {
    await db.collection("nearbyShares").updateOne({ _id: access.share._id }, { $set: { state: "completed", completedAt: new Date(), updatedAt: new Date() } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown nearby-share action." }, { status: 400 });
}
