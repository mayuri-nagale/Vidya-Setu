import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  const lectures = await db.collection("lectures").find({ assignedStandards: student.standard, assignedDivisions: student.division, "quiz.0": { $exists: true } }).sort({ updatedAt: -1 }).toArray();
  const attempts = await db.collection("quizAttempts").find({ studentId }).toArray();
  return NextResponse.json({ quizzes: lectures.map((lecture) => ({ _id: lecture._id.toString(), title: lecture.title, chapter: lecture.chapter, subject: lecture.subject, questions: lecture.quiz.map(({ correctAnswer, ...question }) => question), totalPoints: lecture.quiz.reduce((sum, question) => sum + Number(question.points || 1), 0), attempt: attempts.find((attempt) => attempt.lectureId.toString() === lecture._id.toString()) || null })) });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, answers } = await request.json();
  if (!ObjectId.isValid(lectureId) || !Array.isArray(answers)) return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  const lecture = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), assignedStandards: student.standard, assignedDivisions: student.division });
  if (!lecture?.quiz?.length) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  const results = lecture.quiz.map((question, index) => ({ question: question.question, selectedAnswer: answers[index] ?? null, correctAnswer: question.correctAnswer, correct: String(answers[index] ?? "") === String(question.correctAnswer), points: Number(question.points || 1) }));
  const score = results.reduce((sum, result) => sum + (result.correct ? result.points : 0), 0);
  const totalPoints = results.reduce((sum, result) => sum + result.points, 0);
  const attempt = { studentId, studentName: student.name, lectureId: lecture._id, teacherId: lecture.teacherId, score, totalPoints, percentage: totalPoints ? Math.round((score / totalPoints) * 100) : 0, results, submittedAt: new Date() };
  await db.collection("quizAttempts").updateOne({ studentId, lectureId: lecture._id }, { $set: attempt }, { upsert: true });
  return NextResponse.json({ attempt: { ...attempt, lectureId: lecture._id.toString() } });
}
