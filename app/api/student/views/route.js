import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId } = await request.json();
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid lecture." }, { status: 400 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });
  const result = await db.collection("lectures").updateOne(
    { _id: new ObjectId(lectureId), assignedStandards: student.standard, assignedDivisions: student.division },
    { $addToSet: { viewedBy: studentId }, $set: { updatedAt: new Date() } },
  );
  if (!result.matchedCount) return NextResponse.json({ error: "Lecture is not assigned to this student." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
