import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const teacher = await db.collection("teachers").findOne({ teacherId });
  const students = await db.collection("students").countDocuments({ standard: { $in: teacher?.standards || [] }, division: { $in: teacher?.divisions || [] } });
  const lectures = await db.collection("lectures").find({ teacherId }).toArray();
  const watched = lectures.reduce((sum, lecture) => sum + (lecture.viewedBy?.length || 0), 0);
  const total = students * Math.max(lectures.length, 1);
  const doubts = await db.collection("doubts").countDocuments({ teacherId, status: "open" });
  return NextResponse.json({ totalStudents: students, watchedCount: watched, watchedPercent: total ? Math.round((watched / total) * 100) : 0, notWatchedCount: Math.max(total - watched, 0), openDoubts: doubts });
}
