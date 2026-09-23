"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { assertIsAdmin } from "@/lib/access";
import { KpiMetric } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

const dailyLogSchema = z.object({
  callsMade: z.coerce.number().min(0).default(0),
  followUps: z.coerce.number().min(0).default(0),
  dealsClosed: z.coerce.number().min(0).default(0),
  meetings: z.coerce.number().min(0).default(0),
  outboundReach: z.coerce.number().min(0).default(0),
  discoveryDemos: z.coerce.number().min(0).default(0),
  profilesSignups: z.coerce.number().min(0).default(0),
  activitiesHtml: z.string().optional().nullable(),
});

export async function submitDailyLog(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = dailyLogSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  await db.dailyLog.create({
    data: { userId: user.id, ...data, activitiesHtml: data.activitiesHtml || null },
  });

  revalidatePath("/");
  return { ok: true };
}

const kpiTargetSchema = z.object({
  userId: z.string(),
  kpi: z.nativeEnum(KpiMetric),
  period: z.string(),
  target: z.coerce.number().min(0),
});

export async function setKpiTarget(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertIsAdmin(user, "Only an admin can set KPI targets.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = kpiTargetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { userId, kpi, period, target } = parsed.data;

  await db.kpiTarget.upsert({
    where: { userId_kpi_period: { userId, kpi, period } },
    update: { target },
    create: { userId, kpi, period, target },
  });

  revalidatePath("/team");
  revalidatePath("/");
  return { ok: true };
}
