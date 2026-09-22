import crypto from "node:crypto";
import { cookies } from "next/headers";

const sessionSecret = process.env.SESSION_SECRET || "vidya-setu-local-development-secret";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("hex");
}

export function createSessionToken(userId, role) {
  const value = JSON.stringify({ role, userId, exp: Date.now() + SESSION_DURATION_SECONDS * 1000 });
  return `${Buffer.from(value).toString("base64url")}.${sign(value)}`;
}

export function readSessionToken(token) {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const value = Buffer.from(encoded, "base64url").toString("utf8");
  const expectedSignature = sign(value);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(value);
    if (!session?.role || !session?.userId || !Number.isFinite(session.exp) || session.exp < Date.now()) return null;
    return { role: session.role, userId: session.userId };
  } catch {
    return null;
  }
}

export async function getCurrentTeacherId() {
  const store = await cookies();
  const session = readSessionToken(store.get("vidya_setu_session")?.value);
  return session?.role === "teacher" ? session.userId : null;
}

export async function getCurrentStudentId() {
  const store = await cookies();
  const session = readSessionToken(store.get("vidya_setu_session")?.value);
  return session?.role === "student" ? session.userId : null;
}
