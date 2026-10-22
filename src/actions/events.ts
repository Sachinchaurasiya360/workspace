"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageAll, hasSalesAccess } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { isValidDateString, startOfToday } from "@/lib/dates";
import { db } from "@/lib/db";
import { applyEventChange } from "@/lib/event-changes";
import { isFreeEvent } from "@/lib/events";
import { createNotification, notifyAdmins } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

const optionalDate = z.string().refine(isValidDateString, "Enter a valid date").optional().nullable().or(z.literal(""));
const optionalText = (max = 500) => z.string().trim().max(max).optional().nullable();

const eventInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(300),
  city: optionalText(),
  date: optionalDate,
  time: optionalText(),
  venue: optionalText(),
  targetAudience: optionalText(),
  keyHighlights: optionalText(5000),
  price: optionalText(),
  // Plain text on purpose: legacy links aren't always well-formed URLs.
  link: optionalText(2000),
  registrationDeadline: optionalDate,
  registrationStatus: optionalText(),
});

type User = Awaited<ReturnType<typeof requireUser>>;

/** "Events can be added by authorized team members": admins and the sales team. */
function canAddEvents(user: User) {
  return canManageAll(user) || hasSalesAccess(user);
}

function revalidateEventViews() {
  revalidatePath("/discovery");
  revalidatePath("/approvals");
  revalidatePath("/");
}

function toData(data: z.infer<typeof eventInputSchema>) {
  return {
    name: data.name,
    city: data.city || null,
    date: data.date ? new Date(data.date) : null,
    time: data.time || null,
    venue: data.venue || null,
    targetAudience: data.targetAudience || null,
    keyHighlights: data.keyHighlights || null,
    price: data.price || null,
    link: data.link || null,
    registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
    registrationStatus: data.registrationStatus || null,
  };
}

export async function createEvent(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!canAddEvents(user)) return { ok: false, error: "Only admins and the sales team can add events." };
  const parsed = eventInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const event = await db.event.create({ data: toData(parsed.data) });

  await logActivity(user.id, "event.created", "EVENT", event.id, { label: event.name });
  revalidateEventViews();
  return { ok: true };
}

export async function updateEvent(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!canManageAll(user)) return { ok: false, error: "Only an admin can edit events." };
  const parsed = eventInputSchema.extend({ id: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;

  const existing = await db.event.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Event not found" };
  const event = await db.event.update({ where: { id }, data: toData(data) });

  await logActivity(user.id, "event.updated", "EVENT", id, { label: event.name });
  revalidateEventViews();
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canManageAll(user)) return { ok: false, error: "Only an admin can delete events." };
  const event = await db.event.findUnique({ where: { id }, select: { name: true } });
  if (!event) return { ok: false, error: "Event not found" };

  // Participation, comments and approval requests go with it (cascade).
  await db.event.delete({ where: { id } });
  await logActivity(user.id, "event.deleted", "EVENT", id, { label: event.name });
  revalidateEventViews();
  return { ok: true };
}

/**
 * Free events register instantly; paid events open an approval request
 * instead of adding straight to the user's event overview. Registration is
 * the participation track only — it leaves any organiser (execution) status alone.
 */
export async function respondToEvent(eventId: string, requestNote?: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Event not found" };
  if (event.registrationDeadline && event.registrationDeadline < startOfToday()) {
    return { ok: false, error: "Registration for this event has closed." };
  }

  const existing = await db.eventOverview.findUnique({ where: { userId_eventId: { userId: user.id, eventId } } });
  if (existing?.participation) {
    return { ok: false, error: "You're already registered for this event." };
  }

  if (isFreeEvent(event.price, event.registrationStatus)) {
    await db.eventOverview.upsert({
      where: { userId_eventId: { userId: user.id, eventId } },
      update: { participation: "REGISTERED" },
      create: { userId: user.id, eventId, participation: "REGISTERED" },
    });
    await logActivity(user.id, "event.registered", "EVENT", eventId, { label: event.name });
    await createNotification(user.id, `You're registered for "${event.name}"`, "/discovery");
  } else {
    const open = await db.approval.findFirst({
      where: {
        eventId,
        requestedById: user.id,
        type: "EVENT_ATTENDANCE",
        status: { in: ["REQUEST_RAISED", "DISCUSS", "APPROVED"] },
      },
    });
    if (open) {
      return { ok: false, error: "You already have a request for this event." };
    }
    const approval = await db.approval.create({
      data: {
        type: "EVENT_ATTENDANCE",
        status: "REQUEST_RAISED",
        requestedById: user.id,
        eventId,
        requestNote: requestNote?.trim().slice(0, 4000) || null,
      },
    });
    await logActivity(user.id, "approval.requested", "APPROVAL", approval.id, { label: event.name });
    await notifyAdmins(`${user.name} requested approval to attend "${event.name}"`, "/approvals");
  }

  revalidateEventViews();
  return { ok: true };
}

const changeSchema = z.object({
  eventId: z.string(),
  change: z.enum(["ATTENDED", "IN_PLAN", "CONDUCTED"]),
});

/**
 * Moves one of the user's two tracks forward:
 * - participation: REGISTERED → ATTENDED (needs a registration, so paid
 *   events still go through approval first)
 * - execution: (none) → IN_PLAN → CONDUCTED, for events they organise.
 * Each milestone is timestamped; the event KPIs count on those times.
 */
export async function updateEventParticipation(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = changeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const result = await applyEventChange(user.id, parsed.data.eventId, parsed.data.change);
  if (result.ok) revalidateEventViews();
  return result;
}
