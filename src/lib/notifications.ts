import { db } from "@/lib/db";

export type NotificationInput = { userId: string; message: string; link?: string };

export async function createNotification(userId: string, message: string, link?: string) {
  await db.notification.create({ data: { userId, message, link: link ?? null } });
}

/** One insert for any number of recipients; blanks and duplicates are dropped. */
export async function createNotifications(userIds: Iterable<string | null | undefined>, message: string, link?: string) {
  const ids = [...new Set(userIds)].filter((id): id is string => !!id);
  await createNotificationRows(ids.map((userId) => ({ userId, message, link })));
}

/** Notifications with different messages, in one insert. */
export async function createNotificationRows(rows: NotificationInput[]) {
  if (rows.length === 0) return;
  await db.notification.createMany({
    data: rows.map((r) => ({ userId: r.userId, message: r.message, link: r.link ?? null })),
  });
}

export async function notifyAdmins(message: string, link?: string) {
  await notifyAdminsOfEach([{ message, link }]);
}

/** Every admin gets every message: one lookup and one insert however many there are. */
export async function notifyAdminsOfEach(messages: { message: string; link?: string }[]) {
  if (messages.length === 0) return;
  const admins = await db.user.findMany({
    where: { isActive: true, OR: [{ isFounder: true }, { access: { in: ["ADMIN", "ADMIN_TASK_BASED", "ADMIN_SALES_BASED"] } }] },
    select: { id: true },
  });
  await createNotificationRows(admins.flatMap((a) => messages.map((m) => ({ userId: a.id, ...m }))));
}

export async function getRecentNotifications(userId: string, limit = 15) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getUnreadCount(userId: string) {
  return db.notification.count({ where: { userId, isRead: false } });
}
