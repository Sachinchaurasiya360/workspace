"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canDeleteTask, canEditTask, canManageAll } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { isValidDateString } from "@/lib/dates";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { applyTaskStatusChanges } from "@/lib/task-status";
import { canContributeToProject } from "@/lib/visibility";
import { TaskPriority, TaskStatus } from "@prisma/client";

const dateString = z.string().refine(isValidDateString, "Enter a valid date");

const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  description: z.string().max(10000).optional().nullable(),
  projectId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: dateString.optional().nullable().or(z.literal("")),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

type User = Awaited<ReturnType<typeof requireUser>>;

function revalidateTaskViews() {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects", "layout");
}

async function userName(id: string) {
  return (await db.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}

async function projectLeadOf(projectId: string | null) {
  if (!projectId) return null;
  return (await db.project.findUnique({ where: { id: projectId }, select: { leadId: true } }))?.leadId ?? null;
}

/**
 * Admins can assign anyone active. A project lead can assign within their
 * own project. Everyone else can only assign to themselves — and asking for
 * someone else is an error, not a silent fallback.
 */
async function resolveAssignee(
  user: User,
  requested: string | null | undefined,
  projectId: string | null
): Promise<{ id: string } | { error: string }> {
  if (!requested || requested === user.id) return { id: user.id };
  const allowed = canManageAll(user) || (projectId !== null && (await projectLeadOf(projectId)) === user.id);
  if (!allowed) return { error: "Only an admin or this project's lead can assign tasks to others." };
  const target = await db.user.findUnique({ where: { id: requested }, select: { isActive: true } });
  if (!target?.isActive) return { error: "That team member isn't active." };
  return { id: requested };
}

async function checkProject(user: User, projectId: string | null) {
  if (!projectId) return null;
  return (await canContributeToProject(user, projectId))
    ? null
    : "You can only add tasks to projects you lead or are a member of.";
}

/** A task can be tied to a lead its creator owns (admins: any lead). */
async function checkLead(user: User, leadId: string | null) {
  if (!leadId) return null;
  const lead = await db.lead.findUnique({ where: { id: leadId }, select: { ownerId: true } });
  if (!lead) return "Lead not found.";
  return canManageAll(user) || lead.ownerId === user.id ? null : "You can only link tasks to your own leads.";
}

export async function createTask(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  const projectId = data.projectId || null;

  const projectError = (await checkProject(user, projectId)) ?? (await checkLead(user, data.leadId || null));
  if (projectError) return { ok: false, error: projectError };
  const assignee = await resolveAssignee(user, data.assigneeId, projectId);
  if ("error" in assignee) return { ok: false, error: assignee.error };

  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      projectId,
      leadId: data.leadId || null,
      assigneeId: assignee.id,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: user.id,
    },
  });

  const meta = { label: task.title, projectId: task.projectId };
  await logActivity(user.id, "task.created", "TASK", task.id, meta);
  if (assignee.id !== user.id) {
    await logActivity(user.id, "task.assigned", "TASK", task.id, { ...meta, targetUserName: await userName(assignee.id) });
    await createNotification(assignee.id, `${user.name} assigned you "${task.title}"`, "/tasks");
  }

  revalidateTaskViews();
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
  if (!canEditTask(user, task, await projectLeadOf(task.projectId))) {
    return { ok: false, error: "You don't have access to this task." };
  }

  const nextProjectId = data.projectId !== undefined ? data.projectId || null : task.projectId;
  if (nextProjectId !== task.projectId) {
    const projectError = await checkProject(user, nextProjectId);
    if (projectError) return { ok: false, error: projectError };
  }

  if (data.leadId !== undefined && (data.leadId || null) !== task.leadId) {
    const leadError = await checkLead(user, data.leadId || null);
    if (leadError) return { ok: false, error: leadError };
  }

  let nextAssignee = task.assigneeId;
  if (data.assigneeId && data.assigneeId !== task.assigneeId) {
    const assignee = await resolveAssignee(user, data.assigneeId, nextProjectId);
    if ("error" in assignee) return { ok: false, error: assignee.error };
    nextAssignee = assignee.id;
  }

  const updated = await db.task.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description || null } : {}),
      ...(data.projectId !== undefined ? { projectId: nextProjectId } : {}),
      ...(data.leadId !== undefined ? { leadId: data.leadId || null } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      assigneeId: nextAssignee,
    },
  });

  const meta = { label: updated.title, projectId: updated.projectId };
  if (nextAssignee !== task.assigneeId) {
    await logActivity(user.id, "task.reassigned", "TASK", id, { ...meta, targetUserName: await userName(nextAssignee) });
    if (nextAssignee !== user.id) {
      await createNotification(nextAssignee, `${user.name} assigned you "${updated.title}"`, "/tasks");
    }
  } else {
    await logActivity(user.id, "task.updated", "TASK", id, meta);
    if (task.assigneeId !== user.id) {
      await createNotification(task.assigneeId, `${user.name} updated your task "${updated.title}"`, "/tasks");
    }
  }

  revalidateTaskViews();
  return { ok: true };
}

/**
 * Status changes go through here rather than updateTask because completing a
 * task needs the founder-approval gate (see applyTaskStatusChanges).
 */
export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  const user = await requireUser();
  const [result] = await applyTaskStatusChanges(user, [{ taskId, status }]);
  if (!result?.ok) return { ok: false, error: result?.error ?? "Invalid input" };

  revalidateTaskViews();
  revalidatePath("/approvals");
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const user = await requireUser();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found" };
  if (!canDeleteTask(user, task, await projectLeadOf(task.projectId))) {
    return { ok: false, error: "Only the task's creator, the project lead or an admin can delete it." };
  }

  await db.task.delete({ where: { id: taskId } });
  await logActivity(user.id, "task.deleted", "TASK", taskId, { label: task.title, projectId: task.projectId });
  revalidateTaskViews();
  revalidatePath("/approvals");
  return { ok: true };
}
