import { db } from "@/lib/db";
import { addDays, startOfToday } from "@/lib/events";

export type EventAlert = {
  eventId: string;
  eventName: string;
  kind: "deadline" | "event";
  date: Date;
  daysLeft: number;
  city: string | null;
  /** True when something must happen soon: register before a close deadline, or attend a registered event. */
  needsAction: boolean;
  registered: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Upcoming events and registration deadlines within `windowDays`. Past
 * dates never appear. Sorted soonest-first; urgent ones flagged.
 */
export async function getEventAlerts(userId: string, windowDays: number): Promise<EventAlert[]> {
  const today = startOfToday();
  const until = addDays(today, windowDays);

  const [events, overviews, approvals] = await Promise.all([
    db.event.findMany({
      where: {
        OR: [{ date: { gte: today, lt: until } }, { registrationDeadline: { gte: today, lt: until } }],
      },
      select: { id: true, name: true, date: true, registrationDeadline: true, city: true },
    }),
    db.eventOverview.findMany({ where: { userId }, select: { eventId: true, participation: true } }),
    db.approval.findMany({
      where: { requestedById: userId, type: "EVENT_ATTENDANCE", status: { in: ["REQUEST_RAISED", "DISCUSS"] } },
      select: { eventId: true },
    }),
  ]);

  const standing = new Map(overviews.map((o) => [o.eventId, o.participation]));
  const pending = new Set(approvals.map((a) => a.eventId));
  const alerts: EventAlert[] = [];

  for (const e of events) {
    const registered = !!standing.get(e.id);
    const days = (d: Date) => Math.round((d.getTime() - today.getTime()) / DAY);

    if (e.registrationDeadline && e.registrationDeadline >= today && e.registrationDeadline < until && !registered) {
      const daysLeft = days(e.registrationDeadline);
      alerts.push({
        eventId: e.id,
        eventName: e.name,
        kind: "deadline",
        date: e.registrationDeadline,
        daysLeft,
        city: e.city,
        needsAction: daysLeft <= 3 && !pending.has(e.id),
        registered,
      });
    }
    if (e.date && e.date >= today && e.date < until) {
      const daysLeft = days(e.date);
      alerts.push({
        eventId: e.id,
        eventName: e.name,
        kind: "event",
        date: e.date,
        daysLeft,
        city: e.city,
        needsAction: registered && daysLeft <= 3,
        registered,
      });
    }
  }

  return alerts.sort((a, b) => Number(b.needsAction) - Number(a.needsAction) || a.date.getTime() - b.date.getTime());
}
