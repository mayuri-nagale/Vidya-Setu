import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const quizzes = await db.collection("lectures").find({ teacherId, "quiz.0": { $exists: true } }).sort({ updatedAt: -1 }).toArray();
  const attempts = await db.collection("quizAttempts").find({ teacherId }).toArray();
  return NextResponse.json({ quizzes: quizzes.map((quiz) => { const quizAttempts = attempts.filter((attempt) => attempt.lectureId.toString() === quiz._id.toString()); const scores = quizAttempts.map((attempt) => attempt.percentage); return { _id: quiz._id.toString(), title: quiz.title, chapter: quiz.chapter, questionCount: quiz.quiz.length, attempted: quizAttempts.length, highest: scores.length ? Math.max(...scores) : 0, lowest: scores.length ? Math.min(...scores) : 0, average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0, attempts: quizAttempts }; } ) });
}

export async function POST(request) {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, quiz } = await request.json();
  if (!ObjectId.isValid(lectureId) || !Array.isArray(quiz)) return NextResponse.json({ error: "Invalid quiz." }, { status: 400 });
  const db = await getDb();
  const result = await db.collection("lectures").updateOne({ _id: new ObjectId(lectureId), teacherId }, { $set: { quiz, updatedAt: new Date() } });
  if (!result.matchedCount) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
