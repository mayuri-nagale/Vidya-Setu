import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const lectures = await db.collection("lectures").find({
    assignedStandards: student.standard,
    assignedDivisions: student.division,
  }).sort({ updatedAt: -1 }).toArray();

  return NextResponse.json({ lectures: lectures.map((lecture) => ({
    ...lecture,
    _id: lecture._id.toString(),
    resources: (lecture.resources || []).map((resource) => ({ ...resource, fileId: resource.fileId?.toString() })),
  })) });
}
