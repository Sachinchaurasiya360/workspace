"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertTaskAccess, canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { TaskPriority, TaskStatus } from "@prisma/client";

const taskInputSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  assigneeId: z.string().optional(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: z.string().optional().nullable(),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createTask(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const assigneeId = data.assigneeId && canManageAll(user) ? data.assigneeId : user.id;

  await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      projectId: data.projectId || null,
      assigneeId,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: user.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  return { ok: true };
}

const updateTaskSchema = taskInputSchema.partial().extend({ id: z.string() });

export async function updateTask(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateTaskSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;

  const task = await db.task.findUnique({ where: { id } });
  if (!task) return { ok: false, error: "Task not found" };
  try {
    assertTaskAccess(user, task);
  } catch {
    return { ok: false, error: "You don't have access to this task." };
  }

  await db.task.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.projectId !== undefined ? { projectId: data.projectId || null } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      ...(data.assigneeId && canManageAll(user) ? { assigneeId: data.assigneeId } : {}),
    },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  return { ok: true };
}

/**
 * Status changes go through here rather than updateTask because completing a
 * task needs the founder-approval gate: anyone who isn't a founder/admin
 * moving a task to COMPLETED instead lands it in PENDING_APPROVAL and opens
 * an Approval request, mirroring the legacy workflow.
 */
export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found" };
  try {
    assertTaskAccess(user, task);
  } catch {
    return { ok: false, error: "You don't have access to this task." };
  }

  if (status === TaskStatus.COMPLETED && !user.isFounder) {
    const existingApproval = await db.approval.findFirst({
      where: { taskId, type: "TASK_COMPLETION", status: "REQUEST_RAISED" },
    });
    await db.task.update({ where: { id: taskId }, data: { status: TaskStatus.PENDING_APPROVAL } });
    if (!existingApproval) {
      await db.approval.create({
        data: {
          type: "TASK_COMPLETION",
          status: "REQUEST_RAISED",
          requestedById: user.id,
          taskId,
        },
      });
    }
  } else {
    await db.task.update({ where: { id: taskId }, data: { status } });
  }

  revalidatePath("/");
  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found" };
  try {
    assertTaskAccess(user, task);
  } catch {
    return { ok: false, error: "You don't have access to this task." };
  }

  await db.task.delete({ where: { id: taskId } });
  revalidatePath("/");
  revalidatePath("/projects");
  return { ok: true };
}
