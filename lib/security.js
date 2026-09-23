const loginAttempts = new Map();

export function clientKey(request, scope = "global") {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

// This is a best-effort guard for one running instance. Production deployments
// should additionally enable a shared edge/database rate limit.
export function allowRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || now >= current.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }
  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function jsonError(error, status = 400) {
  return Response.json({ error }, { status });
}

export function boundedText(value, { field = "Value", min = 0, max = 5000 } = {}) {
  const text = String(value || "").trim();
  if (text.length < min) throw new Error(`${field} is required.`);
  if (text.length > max) throw new Error(`${field} must be ${max} characters or less.`);
  return text;
}
