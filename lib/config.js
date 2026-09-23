export function mongoConfig() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;
  if (process.env.NODE_ENV === "production" && (!uri || !dbName)) {
    throw new Error("MONGODB_URI and MONGODB_DB must be configured in production.");
  }
  return { uri: uri || "mongodb://127.0.0.1:27017", dbName: dbName || "vidya_setu" };
}

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }
  return secret || "vidya-setu-local-development-secret";
}
