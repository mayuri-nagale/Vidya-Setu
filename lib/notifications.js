export async function upsertNotifications(db, notifications) {
  const entries = notifications.filter(
    (notification) => notification?.eventKey && notification?.recipientId,
  );
  if (!entries.length) return;

  const now = new Date();
  await db.collection("notifications").bulkWrite(
    entries.map(({ eventKey, createdAt, ...notification }) => ({
      updateOne: {
        filter: { eventKey },
        update: {
          $set: { ...notification, updatedAt: now },
          $setOnInsert: { eventKey, createdAt: createdAt || now },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

export async function getAssignedStudentIds(db, standards = [], divisions = []) {
  const students = await db
    .collection("students")
    .find({
      standard: { $in: standards },
      division: { $in: divisions },
    })
    .project({ studentId: 1 })
    .toArray();
  return students.map((student) => student.studentId);
}
