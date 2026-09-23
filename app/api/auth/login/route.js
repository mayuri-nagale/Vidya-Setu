import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { createSessionToken, verifyPassword } from "../../../../lib/auth";
import { allowRateLimit, clientKey } from "../../../../lib/security";

export async function POST(request) {
  try {
    const { role, id, password } = await request.json();
    if (!["teacher", "student"].includes(role) || typeof id !== "string" || typeof password !== "string" || !id.trim() || !password) {
      return NextResponse.json({ error: "ID and password are required." }, { status: 400 });
    }
    const rate = allowRateLimit(clientKey(request, `login:${String(id).trim().toLowerCase()}`), { limit: 8, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
      );
    }

    const db = await getDb();
    const collection = role === "teacher" ? "teachers" : "students";
    const idField = role === "teacher" ? "teacherId" : "studentId";
    const normalizedId = id.trim();
    const user = await db.collection(collection).findOne({ [idField]: normalizedId });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: `Invalid ${role} ID or password.` }, { status: 401 });
    }

    const response = NextResponse.json({ user: { name: user.name, id: normalizedId, role } });
    response.cookies.set("vidya_setu_session", createSessionToken(normalizedId, role), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    console.error("Login failed", error);
    const production = process.env.NODE_ENV === "production";
    return NextResponse.json({ error: production ? "Sign-in is temporarily unavailable." : "MongoDB is unavailable. Start local MongoDB and try again." }, { status: 503 });
  }
}
