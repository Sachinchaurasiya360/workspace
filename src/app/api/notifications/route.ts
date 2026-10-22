import { NextResponse } from "next/server";

import { getRecentNotifications, getUnreadCount } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

/** Polled by the notification bell so new notifications appear without a page load. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [notifications, unreadCount] = await Promise.all([getRecentNotifications(user.id), getUnreadCount(user.id)]);
  return NextResponse.json(
    { notifications, unreadCount },
    { headers: { "Cache-Control": "no-store" } }
  );
}
