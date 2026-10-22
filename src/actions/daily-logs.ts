"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertIsAdmin } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { applyEventChanges } from "@/lib/event-changes";
import { requireUser } from "@/lib/session";
import { applyTaskStatusChanges } from "@/lib/task-status";
import { KpiMetric, TaskStatus } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

const count = z.coerce.number().int().min(0).max(100000).default(0);

const dailyLogSchema = z.object({
  callsMade: count,
  followUps: count,
  dealsClosed: count,
  meetings: count,
  outboundReach: count,
  discoveryDemos: count,
  profilesSignups: count,
  activitiesHtml: z.string().max(10000).optional().nullable(),
  taskUpdates: z
    .array(z.object({ taskId: z.string(), status: z.nativeEnum(TaskStatus) }))
    .max(50)
    .default([]),
  eventUpdates: z
    .array(z.object({ eventId: z.string(), change: z.enum(["ATTENDED", "CONDUCTED"]) }))
    .max(20)
    .default([]),
});

/**
 * One submission records the day's counters (which feed the KPIs directly)
 * and, optionally, status changes to the tasks worked on — applied through
 * applyTaskStatusChanges so the approval gate still holds.
 */
export async function submitDailyLog(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = dailyLogSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { taskUpdates, eventUpdates, ...data } = parsed.data;

  const tasks = taskUpdates.length
    ? await db.task.findMany({
        where: { id: { in: taskUpdates.map((t) => t.taskId) }, assigneeId: user.id },
        select: { id: true, title: true, status: true },
      })
    : [];

  // Each status change is best-effort: one refused change (e.g. a task that
  // moved on meanwhile) must not lose the rest of the day's update. The
  // snapshot records where each task actually ended up.
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const changes = taskUpdates.filter((u) => {
    const task = taskById.get(u.taskId);
    return task && task.status !== u.status && u.status !== "PENDING_APPROVAL";
  });
  const outcome = new Map((await applyTaskStatusChanges(user, changes)).map((r) => [r.taskId, r]));
  const snapshot = [...new Set(taskUpdates.map((u) => u.taskId))]
    .map((id) => taskById.get(id))
    .filter((t) => !!t)
    .map((task) => {
      const r = outcome.get(task.id);
      return { taskId: task.id, title: task.title, status: r?.ok ? r.status : task.status };
    });

  // Events attended / conducted today, applied through the same rules as the
  // Events page (attending needs a registration), so they feed the event KPIs.
  const eventSnapshot = (await applyEventChanges(user.id, eventUpdates))
    .filter((r) => r.ok && r.name)
    .map((r) => ({ eventId: r.eventId, name: r.name!, change: r.change }));

  const log = await db.dailyLog.create({
    data: {
      userId: user.id,
      ...data,
      activitiesHtml: data.activitiesHtml?.trim() || null,
      taskUpdates: snapshot.length ? snapshot : undefined,
      eventUpdates: eventSnapshot.length ? eventSnapshot : undefined,
    },
  });

  await logActivity(user.id, "daily_log.submitted", "DAILY_LOG", log.id, { label: "Daily update" });
  revalidatePath("/");
  revalidatePath("/daily-updates");
  revalidatePath("/discovery");
  if (changes.length) {
    revalidatePath("/tasks");
    revalidatePath("/projects", "layout");
    revalidatePath("/approvals");
  }
  return { ok: true };
}

const kpiTargetSchema = z.object({
  userId: z.string(),
  kpi: z.nativeEnum(KpiMetric),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Period must look like 2026-09"),
  target: z.coerce.number().int().min(0),
  weight: z.coerce.number().min(0).max(10).default(1),
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
  const { userId, kpi, period, target, weight } = parsed.data;
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
    return { ok: false, error: "Member not found." };
  }

  await db.kpiTarget.upsert({
    where: { userId_kpi_period: { userId, kpi, period } },
    update: { target, weight },
    create: { userId, kpi, period, target, weight },
  });

  revalidatePath("/team");
  revalidatePath("/reports");
  revalidatePath("/");
  return { ok: true };
}
