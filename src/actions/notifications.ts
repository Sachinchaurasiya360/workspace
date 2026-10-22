"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const notification = await db.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== user.id) {
    return { ok: false, error: "Notification not found" };
  }

  await db.notification.update({ where: { id }, data: { isRead: true } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } });
  revalidatePath("/", "layout");
  return { ok: true };
}
