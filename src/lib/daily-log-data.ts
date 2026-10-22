import { db } from "@/lib/db";
import { addDays, startOfDayIST, startOfToday } from "@/lib/dates";
import { formatDate } from "@/lib/format";

/** Legacy imports stored HTML; show it as plain text. */
export function plainText(html: string | null) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TrendRow = { label: string; calls: number; followUps: number; meetings: number; updates: number };

/** Per-day totals for the last `days` days (oldest first), for the activity charts. */
export async function getActivityTrend(userIds: string[] | null, days = 14): Promise<TrendRow[]> {
  const start = addDays(startOfToday(), -(days - 1));
  const logs = await db.dailyLog.findMany({
    where: { createdAt: { gte: start }, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { createdAt: true, callsMade: true, followUps: true, meetings: true },
  });

  const rows: TrendRow[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    rows.push({
      label: formatDate(day, { day: "numeric", month: "short" }),
      calls: 0,
      followUps: 0,
      meetings: 0,
      updates: 0,
    });
  }
  for (const log of logs) {
    const index = Math.round((startOfDayIST(log.createdAt).getTime() - start.getTime()) / 86_400_000);
    const row = rows[index];
    if (!row) continue;
    row.calls += log.callsMade;
    row.followUps += log.followUps;
    row.meetings += log.meetings;
    row.updates += 1;
  }
  return rows;
}


/** Events the user can still record in a daily update: registered (→ attended) or organising (→ conducted). */
export async function getOpenEvents(userId: string) {
  const rows = await db.eventOverview.findMany({
    where: { userId, OR: [{ participation: "REGISTERED" }, { execution: "IN_PLAN" }] },
    include: { event: { select: { name: true, date: true } } },
    orderBy: { event: { date: { sort: "asc", nulls: "last" } } },
    take: 20,
  });
  return rows.map((r) => ({
    eventId: r.eventId,
    name: r.event.name,
    canAttend: r.participation === "REGISTERED",
    canConduct: r.execution === "IN_PLAN",
  }));
}
