import { NextResponse } from "next/server";
import { getDb } from "../../../../lib/mongodb";
import { getCurrentTeacherId } from "../../../../lib/auth";

export async function GET() {
  const teacherId = await getCurrentTeacherId();
  if (!teacherId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = await getDb();
  const notifications = await db
    .collection("notifications")
    .find({ recipientRole: "teacher", recipientId: teacherId })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();

  return NextResponse.json({
    notifications: notifications.map((notification) => ({
      ...notification,
      _id: notification._id.toString(),
    })),
  });
}
