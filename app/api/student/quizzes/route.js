import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";
import { upsertNotifications } from "../../../../lib/notifications";

export async function GET() {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  const lectures = await db.collection("lectures").find({ assignedStandards: student.standard, assignedDivisions: student.division, "quiz.0": { $exists: true } }).sort({ updatedAt: -1 }).toArray();
  const attempts = await db.collection("quizAttempts").find({ studentId }).toArray();
  return NextResponse.json({ quizzes: lectures.map((lecture) => ({ _id: lecture._id.toString(), title: lecture.title, chapter: lecture.chapter, subject: lecture.subject, version: Number(lecture.version || 1), versionId: lecture.versionId || null, questions: lecture.quiz.map(({ correctAnswer, ...question }) => question), totalPoints: lecture.quiz.reduce((sum, question) => sum + Number(question.points || 1), 0), attempt: attempts.find((attempt) => attempt.lectureId.toString() === lecture._id.toString()) || null })) });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lectureId, answers, lectureVersion, clientSyncId } = await request.json();
  if (!ObjectId.isValid(lectureId) || !Array.isArray(answers)) return NextResponse.json({ error: "Invalid quiz submission." }, { status: 400 });
  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  const lecture = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), assignedStandards: student.standard, assignedDivisions: student.division });
  if (!lecture?.quiz?.length) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  if (lectureVersion && Number(lectureVersion) !== Number(lecture.version || 1)) {
    return NextResponse.json({ error: "This quiz was updated. Refresh it before submitting.", code: "STALE_QUIZ" }, { status: 409 });
  }
  if (answers.length > lecture.quiz.length || answers.some((answer) => String(answer ?? "").length > 500)) return NextResponse.json({ error: "Invalid quiz answers." }, { status: 400 });
  const existingAttempt = await db.collection("quizAttempts").findOne({ studentId, lectureId: lecture._id });
  if (existingAttempt) {
    if (clientSyncId && existingAttempt.clientSyncId === clientSyncId) {
      return NextResponse.json({ attempt: { ...existingAttempt, lectureId: lecture._id.toString() } });
    }
    return NextResponse.json({ error: "Only one attempt is allowed for this quiz.", code: "ATTEMPT_EXISTS" }, { status: 409 });
  }
  const results = lecture.quiz.map((question, index) => ({ question: question.question, selectedAnswer: answers[index] ?? null, correctAnswer: question.correctAnswer, correct: String(answers[index] ?? "") === String(question.correctAnswer), points: Number(question.points || 1) }));
  const score = results.reduce((sum, result) => sum + (result.correct ? result.points : 0), 0);
  const totalPoints = results.reduce((sum, result) => sum + result.points, 0);
  const attempt = { studentId, studentName: student.name, lectureId: lecture._id, lectureVersion: Number(lecture.version || 1), lectureVersionId: lecture.versionId || null, teacherId: lecture.teacherId, clientSyncId: String(clientSyncId || "").trim().slice(0, 128) || null, score, totalPoints, percentage: totalPoints ? Math.round((score / totalPoints) * 100) : 0, results, submittedAt: new Date() };
  try {
    await db.collection("quizAttempts").insertOne(attempt);
  } catch (error) {
    if (error?.code === 11000) return NextResponse.json({ error: "Only one attempt is allowed for this quiz.", code: "ATTEMPT_EXISTS" }, { status: 409 });
    throw error;
  }
  await upsertNotifications(db, [
    {
      eventKey: `quiz:${lecture._id}:attempt:${studentId}:teacher`,
      recipientRole: "teacher",
      recipientId: lecture.teacherId,
      type: "quiz_attempt",
      title: `${student.name} attempted ${lecture.title}`,
      detail: `Score: ${score}/${totalPoints} (${attempt.percentage}%)`,
      lectureId: lecture._id.toString(),
      createdAt: attempt.submittedAt,
    },
    {
      eventKey: `quiz:${lecture._id}:attempt:${studentId}:student`,
      recipientRole: "student",
      recipientId: studentId,
      type: "quiz_submitted",
      title: `Quiz submitted: ${lecture.title}`,
      detail: `Your score is ${score}/${totalPoints} (${attempt.percentage}%).`,
      lectureId: lecture._id.toString(),
      createdAt: attempt.submittedAt,
    },
  ]);
  return NextResponse.json({ attempt: { ...attempt, lectureId: lecture._id.toString() } });
}
