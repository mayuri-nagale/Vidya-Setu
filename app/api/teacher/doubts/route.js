import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const doubts = await db.collection("doubts").find({ teacherId }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({ unread: doubts.filter((doubt) => doubt.status === "open").length, doubts: doubts.map((doubt) => ({ ...doubt, _id: doubt._id.toString(), lectureId: doubt.lectureId.toString() })) });
}

export async function POST(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { doubtId, reply } = await request.json();
  if (!ObjectId.isValid(doubtId) || !String(reply || "").trim()) return NextResponse.json({ error: "Doubt and reply are required." }, { status: 400 });
  const db = await getDb();
  const result = await db.collection("doubts").findOneAndUpdate(
    { _id: new ObjectId(doubtId), teacherId },
    { $push: { replies: { from: "teacher", text: String(reply).trim(), createdAt: new Date() } }, $set: { status: "answered", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) return NextResponse.json({ error: "Doubt not found." }, { status: 404 });
  return NextResponse.json({ doubt: { ...result, _id: result._id.toString(), lectureId: result.lectureId.toString() } });
}
