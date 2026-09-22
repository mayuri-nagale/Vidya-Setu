import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const teacher = await db.collection("teachers").findOne({ teacherId }, { projection: { passwordHash: 0 } });
  if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

  return NextResponse.json({ teacher });
}
