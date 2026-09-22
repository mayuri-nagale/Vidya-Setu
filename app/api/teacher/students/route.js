import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const teacher = await db.collection("teachers").findOne({ teacherId });
  const students = await db.collection("students").find({ standard: { $in: teacher?.standards || [] }, division: { $in: teacher?.divisions || [] } }, { projection: { passwordHash: 0 } }).sort({ rollNumber: 1 }).toArray();
  return NextResponse.json({ students });
}
