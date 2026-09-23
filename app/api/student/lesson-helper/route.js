import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentStudentId } from "../../../../lib/auth";
import { allowRateLimit, boundedText, clientKey } from "../../../../lib/security";

export const runtime = "nodejs";

function responseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n")
    .trim();
}

function safeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-4).flatMap((message) => {
    if (!["student", "assistant"].includes(message?.role)) return [];
    const text = String(message.text || "").trim().slice(0, 800);
    return text ? [`${message.role === "student" ? "Student" : "Helper"}: ${text}`] : [];
  });
}

export async function POST(request) {
  const studentId = await getCurrentStudentId();
  if (!studentId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rate = allowRateLimit(clientKey(request, `lesson-helper:${studentId}`), { limit: 15, windowMs: 5 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: "Please wait a few minutes before asking more questions." }, { status: 429, headers: { "Retry-After": String(rate.retryAfter) } });

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!ObjectId.isValid(body.lectureId)) return NextResponse.json({ error: "Invalid lesson." }, { status: 400 });

  let question;
  try { question = boundedText(body.question, { field: "Question", min: 2, max: 1200 }); } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Lesson helper is not configured yet. Ask your teacher instead.", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const db = await getDb();
  const student = await db.collection("students").findOne({ studentId }, { projection: { standard: 1, division: 1 } });
  const lecture = await db.collection("lectures").findOne({
    _id: new ObjectId(body.lectureId),
    assignedStandards: student?.standard,
    assignedDivisions: student?.division,
  }, { projection: { title: 1, subject: 1, chapter: 1, description: 1, version: 1, resources: 1 } });
  if (!lecture) return NextResponse.json({ error: "This lesson is not assigned to you." }, { status: 403 });

  const position = body.resourceKind === "video"
    ? `Video timestamp: ${Math.max(0, Math.min(86400, Number(body.timestampSeconds) || 0))} seconds.`
    : body.pageNumber ? `Document page: ${Math.max(1, Math.min(10000, Number(body.pageNumber) || 1))}.` : "No page number was provided.";
  const resources = (lecture.resources || []).slice(0, 12).map((resource) => `${resource.kind}: ${resource.filename}`).join(", ") || "No attached files.";
  const context = [
    `Lesson title: ${lecture.title}`,
    `Subject: ${lecture.subject}`,
    `Chapter: ${lecture.chapter}`,
    `Version: ${lecture.version || 1}`,
    `Teacher description: ${String(lecture.description || "Not provided").slice(0, 3000)}`,
    `Available resources: ${resources}`,
    position,
  ].join("\n");
  const instructions = `You are Vidya Setu's lesson helper for a school student. Help only with the supplied lesson topic. Give a short, clear explanation in simple language, using steps or an example when useful. Do not answer unrelated open-chat questions. You cannot see unseen video frames, PPT pages, or PDF text, so never pretend that you can. If the lesson context is insufficient, the question is unrelated, or the student needs a teacher's exact clarification, reply exactly in this format: FALLBACK: <short reason>. Otherwise reply exactly in this format: ANSWER: <helpful answer>.`;
  const input = `${context}\n\nRecent chat:\n${safeHistory(body.history).join("\n") || "None"}\n\nStudent question: ${question}`;

  let providerResponse;
  try {
    providerResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-6-luna", instructions, input, max_output_tokens: 350, store: false }),
    });
  } catch {
    return NextResponse.json({ error: "Lesson helper is temporarily unavailable. You can send this doubt to mam." }, { status: 503 });
  }
  const payload = await providerResponse.json().catch(() => ({}));
  if (!providerResponse.ok) {
    console.error("Lesson helper provider error", providerResponse.status, payload?.error?.message);
    return NextResponse.json({ error: "Lesson helper is temporarily unavailable. You can send this doubt to mam." }, { status: providerResponse.status === 429 ? 429 : 503 });
  }
  const raw = responseText(payload).slice(0, 3000);
  const fallback = raw.startsWith("FALLBACK:");
  const answer = raw.replace(/^(ANSWER|FALLBACK):\s*/i, "").trim();
  if (!answer) return NextResponse.json({ answer: "I need your teacher to clarify this. Please send it as a doubt.", fallback: true });
  return NextResponse.json({ answer, fallback });
}
