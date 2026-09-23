import { MongoClient } from "mongodb";
import { ensureDatabaseSchema } from "../lib/database.js";

const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017");

function snapshot(lecture, fileId = null) {
  const resource = fileId ? lecture.resources?.find((item) => item.fileId?.toString() === fileId.toString()) : null;
  return {
    lectureVersion: Number(lecture.version || 1),
    lectureVersionId: lecture.versionId || null,
    ...(fileId ? {
      resourceVersion: Number(resource?.version || lecture.version || 1),
      resourceVersionId: resource?.versionId || lecture.versionId || null,
    } : {}),
    versionSnapshotSource: "backfilled-current",
  };
}

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "vidya_setu");
  await ensureDatabaseSchema(db);
  const lectures = await db.collection("lectures").find({}).toArray();
  const lectureById = new Map(lectures.map((lecture) => [lecture._id.toString(), lecture]));

  for (const [collectionName, fileField] of [["doubts", null], ["downloads", "fileId"], ["quizAttempts", null]]) {
    const records = await db.collection(collectionName).find({ lectureVersion: { $exists: false } }).toArray();
    const operations = records.flatMap((record) => {
      const lecture = lectureById.get(record.lectureId?.toString());
      return lecture ? [{ updateOne: { filter: { _id: record._id }, update: { $set: snapshot(lecture, fileField ? record[fileField] : null) } } }] : [];
    });
    if (operations.length) await db.collection(collectionName).bulkWrite(operations, { ordered: false });
    console.log(`${collectionName}: updated ${operations.length} records.`);
  }
} finally {
  await client.close();
}
