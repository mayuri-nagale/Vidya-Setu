const indexDefinitions = [
  ["teachers", { teacherId: 1 }, { unique: true }],
  ["students", { studentId: 1 }, { unique: true }],
  ["students", { standard: 1, division: 1 }],
  ["lectures", { teacherId: 1, createdAt: -1 }],
  // MongoDB cannot create one compound index from two array fields. Both
  // assignment fields are still checked in the query; this index narrows the
  // result set by the student's standard and keeps recent content fast.
  ["lectures", { assignedStandards: 1, updatedAt: -1 }],
  ["doubts", { teacherId: 1, status: 1, createdAt: -1 }],
  ["doubts", { studentId: 1, createdAt: -1 }],
  ["downloads", { studentId: 1, fileId: 1 }, { unique: true }],
  ["quizAttempts", { studentId: 1, lectureId: 1 }, { unique: true }],
  ["quizAttempts", { teacherId: 1, lectureId: 1 }],
  ["notifications", { eventKey: 1 }, { unique: true }],
  ["notifications", { recipientRole: 1, recipientId: 1, createdAt: -1 }],
  ["nearbyShares", { shareCode: 1 }, { unique: true }],
  ["nearbyShares", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
  ["nearbyShares", { senderId: 1, updatedAt: -1 }],
];

export async function ensureDatabaseSchema(db) {
  if (db.__vidyaSetuSchemaReady) return;
  await Promise.all(indexDefinitions.map(([collection, keys, options]) => db.collection(collection).createIndex(keys, options)));
  db.__vidyaSetuSchemaReady = true;
}
