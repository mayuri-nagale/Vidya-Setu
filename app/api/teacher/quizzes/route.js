import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";
import { validateQuiz } from "../../../../lib/validation";
import { getAssignedStudentIds, upsertNotifications } from "../../../../lib/notifications";
import { randomUUID } from "node:crypto";

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
  if (!ObjectId.isValid(lectureId)) return NextResponse.json({ error: "Invalid quiz." }, { status: 400 });
  let validatedQuiz;
  try { validatedQuiz = validateQuiz(quiz); } catch (error) { return NextResponse.json({ error: error.message || "Invalid quiz." }, { status: 400 }); }
  const db = await getDb();
  const existing = await db.collection("lectures").findOne({ _id: new ObjectId(lectureId), teacherId });
  if (!existing) return NextResponse.json({ error: "Lecture not found." }, { status: 404 });
  const now = new Date();
  const nextVersion = Number(existing.version || 1) + 1;
  const versionId = `v_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const changes = "Quiz questions were updated.";
  const result = await db.collection("lectures").updateOne(
    { _id: existing._id, teacherId, version: existing.version || 1 },
    { $set: {
      quiz: validatedQuiz, version: nextVersion, versionId, updatedAt: now, publishedAt: now,
      versionChanges: [...(existing.versionChanges || []), { version: nextVersion, versionId, changes, summaryNote: changes, createdAt: now }],
      versionHistory: [...(existing.versionHistory || []), { version: existing.version || 1, versionId: existing.versionId, status: existing.status || "Published", verification: existing.verification || "Verified", createdAt: existing.updatedAt || existing.createdAt }].filter((item) => item.versionId),
    } },
  );
  if (!result.matchedCount) return NextResponse.json({ error: "This lecture changed in another tab. Refresh and try again." }, { status: 409 });
  const studentIds = await getAssignedStudentIds(db, existing.assignedStandards, existing.assignedDivisions);
  await upsertNotifications(db, studentIds.map((studentId) => ({
    eventKey: `lecture:${existing._id}:version:${nextVersion}:${studentId}`,
    recipientRole: "student", recipientId: studentId, type: "content_updated",
    title: `${existing.title} was updated`, detail: changes,
    lectureId: existing._id.toString(), version: nextVersion, createdAt: now,
  })));
  return NextResponse.json({ ok: true, version: nextVersion, versionId });
}
