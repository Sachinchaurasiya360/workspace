import { logActivities, type AuditEntry } from "@/lib/audit";
import { db } from "@/lib/db";

export type EventChange = "ATTENDED" | "IN_PLAN" | "CONDUCTED";
type Result = { ok: true } | { ok: false; error: string };
export type EventChangeResult<C extends EventChange> = Result & { eventId: string; change: C; name: string | null };

/** Applies one participation/execution milestone for `userId`. Callers check who's allowed. */
export async function applyEventChange(userId: string, eventId: string, change: EventChange): Promise<Result> {
  const [result] = await applyEventChanges(userId, [{ eventId, change }]);
  return result!.ok ? { ok: true } : { ok: false, error: result!.error };
}

/**
 * Many milestones for `userId` in a fixed number of queries; each one stands
 * or falls on its own. Results come back once per distinct (event, change).
 */
export async function applyEventChanges<C extends EventChange>(
  userId: string,
  changes: { eventId: string; change: C }[]
): Promise<EventChangeResult<C>[]> {
  const unique = [...new Map(changes.map((c) => [`${c.eventId}:${c.change}`, c])).values()];
  if (unique.length === 0) return [];
  const eventIds = [...new Set(unique.map((c) => c.eventId))];

  const [events, overviews] = await Promise.all([
    db.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } }),
    db.eventOverview.findMany({ where: { userId, eventId: { in: eventIds } } }),
  ]);
  const nameOf = new Map(events.map((e) => [e.id, e.name]));
  const existingFor = new Map(overviews.map((o) => [o.eventId, o]));
  // Conducting supersedes planning the same event in one batch.
  const conducting = new Set(unique.filter((c) => c.change === "CONDUCTED").map((c) => c.eventId));

  const attend: string[] = [];
  const plan: string[] = [];
  const conduct: string[] = [];
  const activities: AuditEntry[] = [];

  const results = unique.map((c): EventChangeResult<C> => {
    const name = nameOf.get(c.eventId) ?? null;
    if (!name) return { ...c, name, ok: false, error: "Event not found" };
    const existing = existingFor.get(c.eventId);
    const done = { ...c, name, ok: true as const };

    if (c.change === "ATTENDED") {
      if (existing?.participation === "ATTENDED") return done;
      if (existing?.participation !== "REGISTERED") {
        return { ...c, name, ok: false, error: "Register for (or get approval for) this event before marking it attended." };
      }
      attend.push(existing.id);
      activities.push({ action: "event.attended", entityType: "EVENT", entityId: c.eventId, metadata: { label: name } });
    } else if (c.change === "IN_PLAN") {
      if (existing?.execution || conducting.has(c.eventId)) return done;
      plan.push(c.eventId);
    } else {
      if (existing?.execution === "CONDUCTED") return done;
      conduct.push(c.eventId);
      activities.push({ action: "event.conducted", entityType: "EVENT", entityId: c.eventId, metadata: { label: name } });
    }
    return done;
  });

  const missing = [...plan, ...conduct].filter((eventId) => !existingFor.has(eventId));
  const now = new Date();
  // Create any missing rows, then set the milestones — the same outcome as an
  // upsert per event, in one round trip.
  await db.$transaction([
    ...(missing.length
      ? [db.eventOverview.createMany({ data: missing.map((eventId) => ({ userId, eventId })), skipDuplicates: true })]
      : []),
    ...(attend.length
      ? [db.eventOverview.updateMany({ where: { id: { in: attend } }, data: { participation: "ATTENDED", attendedAt: now } })]
      : []),
    ...(plan.length
      ? [db.eventOverview.updateMany({ where: { userId, eventId: { in: plan } }, data: { execution: "IN_PLAN" } })]
      : []),
    ...(conduct.length
      ? [
          db.eventOverview.updateMany({
            where: { userId, eventId: { in: conduct } },
            data: { execution: "CONDUCTED", conductedAt: now },
          }),
        ]
      : []),
  ]);
  await logActivities(userId, activities);
  return results;
}
