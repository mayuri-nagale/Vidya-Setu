import { MongoClient } from "mongodb";
import crypto from "node:crypto";
import { ensureDatabaseSchema } from "../lib/database.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB || "vidya_setu";
const client = new MongoClient(uri);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

await client.connect();
const db = client.db(dbName);
await ensureDatabaseSchema(db);
await db.collection("teachers").updateOne(
  { teacherId: "TCH-001" },
  { $set: { teacherId: "TCH-001", name: "Dr. Meera Sharma", subject: "Mathematics", standards: ["Class 10"], divisions: ["10A"], studentCount: 48, email: "meera.sharma@vidyasetu.in", passwordHash: hashPassword("teacher123"), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
  { upsert: true },
);
for (let number = 101; number <= 110; number += 1) {
  await db.collection("students").updateOne(
    { studentId: String(number) },
    { $set: { studentId: String(number), name: `Student ${number}`, standard: "Class 10", division: "10A", rollNumber: number - 100, email: `student${number}@vidyasetu.in`, passwordHash: hashPassword("student123"), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}
console.log("Seeded teacher: TCH-001 / teacher123");
console.log("Seeded students: 101-110 / student123 (Class 10A)");
await client.close();
