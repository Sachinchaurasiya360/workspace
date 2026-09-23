"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

const eventInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  city: z.string().optional().nullable(),
  date: z.string().optional().nullable(),
  time: z.string().optional().nullable(),
  venue: z.string().optional().nullable(),
  targetAudience: z.string().optional().nullable(),
  keyHighlights: z.string().optional().nullable(),
  price: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  registrationDeadline: z.string().optional().nullable(),
});

export async function createEvent(raw: unknown): Promise<ActionResult> {
  await requireUser();
  const parsed = eventInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  await db.event.create({
    data: {
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
    },
  });

  revalidatePath("/discovery");
  return { ok: true };
}

function isFreeEvent(price: string | null): boolean {
  if (!price) return true;
  return /free/i.test(price);
}

/**
 * Free events register instantly; paid events open an approval request
 * instead of adding straight to the user's event overview.
 */
export async function respondToEvent(eventId: string): Promise<ActionResult> {
  const user = await requireUser();
  const event = await db.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, error: "Event not found" };

  if (isFreeEvent(event.price)) {
    await db.eventOverview.upsert({
      where: { userId_eventId: { userId: user.id, eventId } },
      update: { status: "REGISTERED" },
      create: { userId: user.id, eventId, status: "REGISTERED" },
    });
  } else {
    const existing = await db.approval.findFirst({
      where: { eventId, requestedById: user.id, type: "EVENT_ATTENDANCE", status: "REQUEST_RAISED" },
    });
    if (!existing) {
      await db.approval.create({
        data: { type: "EVENT_ATTENDANCE", status: "REQUEST_RAISED", requestedById: user.id, eventId },
      });
    }
  }

  revalidatePath("/discovery");
  revalidatePath("/");
  return { ok: true };
}
