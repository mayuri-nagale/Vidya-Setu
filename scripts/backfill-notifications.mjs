import { MongoClient } from "mongodb";
import { upsertNotifications } from "../lib/notifications.js";

const client = new MongoClient(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
);

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "vidya_setu");
  const [students, lectures, reminders, doubts, downloads, attempts] =
    await Promise.all([
      db.collection("students").find({}).toArray(),
      db.collection("lectures").find({}).toArray(),
      db.collection("lectureReminders").find({}).toArray(),
      db.collection("doubts").find({}).toArray(),
      db.collection("downloads").find({ completed: true }).toArray(),
      db.collection("quizAttempts").find({}).toArray(),
    ]);

  const lectureById = new Map(
    lectures.map((lecture) => [lecture._id.toString(), lecture]),
  );
  const notifications = [];

  lectures.forEach((lecture) => {
    const lectureId = lecture._id.toString();
    const assignedStudents = students.filter(
      (student) =>
        lecture.assignedStandards?.includes(student.standard) &&
        lecture.assignedDivisions?.includes(student.division),
    );
    assignedStudents.forEach((student) => {
      notifications.push({
        eventKey: `lecture:${lectureId}:published:${student.studentId}`,
        recipientRole: "student",
        recipientId: student.studentId,
        type: "new_content",
        title: `New lesson: ${lecture.title}`,
        detail: `${lecture.subject} · ${lecture.chapter} · ${(lecture.resources || []).length} resource${(lecture.resources || []).length === 1 ? "" : "s"} added`,
        lectureId,
        version: lecture.version,
        createdAt: lecture.publishedAt || lecture.createdAt,
      });
      (lecture.versionChanges || []).forEach((change, index) =>
        notifications.push({
          eventKey: `lecture:${lectureId}:version:${change.version || index}:${student.studentId}`,
          recipientRole: "student",
          recipientId: student.studentId,
          type: "content_updated",
          title: `${lecture.title} was updated`,
          detail: change.summaryNote || change.changes || "A newer version is available.",
          lectureId,
          version: change.version,
          createdAt: change.createdAt || lecture.updatedAt,
        }),
      );
    });
  });

  reminders.forEach((reminder) => {
    const lecture = lectureById.get(reminder.lectureId.toString());
    reminder.studentIds.forEach((studentId) =>
      notifications.push({
        eventKey: `reminder:${reminder.lectureId}:${reminder.version}:${new Date(reminder.sentAt).getTime()}:${studentId}`,
        recipientRole: "student",
        recipientId: studentId,
        type: "reminder",
        title: `Reminder from mam: ${lecture?.title || "Complete your lesson"}`,
        detail: reminder.message || `Please complete ${lecture?.title || "this lesson"}.`,
        lectureId: reminder.lectureId.toString(),
        version: reminder.version,
        createdAt: reminder.sentAt,
      }),
    );
  });

  downloads.forEach((download) => {
    const lecture = lectureById.get(download.lectureId.toString());
    notifications.push({
      eventKey: `download:${download.studentId}:${download.fileId}:completed`,
      recipientRole: "student",
      recipientId: download.studentId,
      type: "download_complete",
      title: `${download.filename} downloaded`,
      detail: `${lecture?.title || "Resource"} is ready in your offline library.`,
      lectureId: download.lectureId.toString(),
      createdAt: download.updatedAt || download.createdAt,
    });
  });

  doubts.forEach((doubt) => {
    notifications.push({
      eventKey: `doubt:${doubt._id}:teacher`,
      recipientRole: "teacher",
      recipientId: doubt.teacherId,
      type: "doubt",
      title: `${doubt.studentName} asked a doubt`,
      detail: `${doubt.title}: ${doubt.question}`,
      lectureId: doubt.lectureId.toString(),
      doubtId: doubt._id.toString(),
      createdAt: doubt.createdAt,
    });
    const latestReply = doubt.replies?.at(-1);
    if (latestReply?.from === "teacher") {
      notifications.push({
        eventKey: `doubt:${doubt._id}:reply:${new Date(latestReply.createdAt).getTime()}`,
        recipientRole: "student",
        recipientId: doubt.studentId,
        type: "doubt_reply",
        title: `Mam replied to your doubt in ${doubt.title}`,
        detail: latestReply.text,
        lectureId: doubt.lectureId.toString(),
        doubtId: doubt._id.toString(),
        createdAt: latestReply.createdAt,
      });
    }
  });

  attempts.forEach((attempt) => {
    const lecture = lectureById.get(attempt.lectureId.toString());
    notifications.push(
      {
        eventKey: `quiz:${attempt.lectureId}:attempt:${attempt.studentId}:teacher`,
        recipientRole: "teacher",
        recipientId: attempt.teacherId,
        type: "quiz_attempt",
        title: `${attempt.studentName} attempted ${lecture?.title || "a quiz"}`,
        detail: `Score: ${attempt.score}/${attempt.totalPoints} (${attempt.percentage}%)`,
        lectureId: attempt.lectureId.toString(),
        createdAt: attempt.submittedAt,
      },
      {
        eventKey: `quiz:${attempt.lectureId}:attempt:${attempt.studentId}:student`,
        recipientRole: "student",
        recipientId: attempt.studentId,
        type: "quiz_submitted",
        title: `Quiz submitted: ${lecture?.title || "Quiz"}`,
        detail: `Your score is ${attempt.score}/${attempt.totalPoints} (${attempt.percentage}%).`,
        lectureId: attempt.lectureId.toString(),
        createdAt: attempt.submittedAt,
      },
    );
  });

  await upsertNotifications(db, notifications);
  console.log(`Backfilled ${notifications.length} notification records.`);
} finally {
  await client.close();
}
