import { canEditTask, canManageAll } from "@/lib/access";
import { logActivities, type AuditEntry } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotificationRows, notifyAdminsOfEach, type NotificationInput } from "@/lib/notifications";
import type { CurrentUser } from "@/lib/session";
import { TaskStatus, type Prisma } from "@prisma/client";

export type StatusChange = { taskId: string; status: TaskStatus };
export type StatusChangeResult =
  | { taskId: string; ok: true; status: TaskStatus }
  | { taskId: string; ok: false; error: string };

const OPEN_APPROVAL = { in: ["REQUEST_RAISED", "DISCUSS"] } satisfies Prisma.EnumApprovalStatusFilter;

const statusLabel = (s: TaskStatus) => s.replace("_", " ").toLowerCase();

/**
 * Status changes for any number of tasks in a fixed number of queries. Each
 * change stands or falls on its own; the result says where each task ended up.
 *
 * Completing a task needs the founder-approval gate: anyone who isn't a
 * founder/admin moving a task to COMPLETED instead lands it in
 * PENDING_APPROVAL and opens an Approval request, mirroring the legacy workflow.
 */
export async function applyTaskStatusChanges(user: CurrentUser, changes: StatusChange[]): Promise<StatusChangeResult[]> {
  // The last change asked for a task wins.
  const wanted = new Map(changes.map((c) => [c.taskId, c.status]));
  if (wanted.size === 0) return [];

  const tasks = await db.task.findMany({
    where: { id: { in: [...wanted.keys()] } },
    include: { project: { select: { leadId: true } } },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  type Task = (typeof tasks)[number];

  const results = new Map<string, StatusChangeResult>();
  const gated: Task[] = [];
  const direct: { task: Task; status: TaskStatus }[] = [];
  const isAdmin = canManageAll(user);

  for (const [taskId, status] of wanted) {
    const task = byId.get(taskId);
    const fail = (error: string) => results.set(taskId, { taskId, ok: false, error });
    if (!Object.values(TaskStatus).includes(status)) fail("Invalid status");
    else if (!task) fail("Task not found");
    else if (!canEditTask(user, task, task.project?.leadId)) fail("You don't have access to this task.");
    else if (task.status === status) results.set(taskId, { taskId, ok: true, status });
    else if (status === TaskStatus.PENDING_APPROVAL) fail("Move the task to Completed to request approval.");
    else if (status === TaskStatus.COMPLETED && !isAdmin) {
      gated.push(task);
      results.set(taskId, { taskId, ok: true, status: TaskStatus.PENDING_APPROVAL });
    } else {
      direct.push({ task, status });
      results.set(taskId, { taskId, ok: true, status });
    }
  }

  const meta = (task: Task, to: TaskStatus) => ({ label: task.title, projectId: task.projectId, from: task.status, to });
  const activities: AuditEntry[] = [];
  const notifications: NotificationInput[] = [];
  const adminMessages: { message: string; link: string }[] = [];
  const now = new Date();

  if (gated.length) {
    const ids = gated.map((t) => t.id);
    const open = await db.approval.findMany({
      where: { taskId: { in: ids }, type: "TASK_COMPLETION", status: OPEN_APPROVAL },
      select: { taskId: true },
    });
    const hasOpen = new Set(open.map((a) => a.taskId));
    const needApproval = gated.filter((t) => !hasOpen.has(t.id));
    const [, created] = await db.$transaction([
      db.task.updateMany({ where: { id: { in: ids } }, data: { status: TaskStatus.PENDING_APPROVAL, completedAt: null } }),
      db.approval.createManyAndReturn({
        data: needApproval.map((t) => ({
          type: "TASK_COMPLETION" as const,
          status: "REQUEST_RAISED" as const,
          requestedById: user.id,
          taskId: t.id,
        })),
        select: { id: true, taskId: true },
      }),
    ]);
    for (const approval of created) {
      const task = byId.get(approval.taskId!)!;
      activities.push({ action: "approval.requested", entityType: "APPROVAL", entityId: approval.id, metadata: meta(task, TaskStatus.COMPLETED) });
      adminMessages.push({ message: `${user.name} requested approval to complete "${task.title}"`, link: "/approvals" });
    }
  }

  if (direct.length) {
    const byStatus = new Map<TaskStatus, Task[]>();
    for (const { task, status } of direct) byStatus.set(status, [...(byStatus.get(status) ?? []), task]);

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const [status, group] of byStatus) {
      writes.push(
        db.task.updateMany({
          where: { id: { in: group.map((t) => t.id) } },
          data: { status, completedAt: status === TaskStatus.COMPLETED ? now : null },
        })
      );
      // Any open completion request is withdrawn once the status moves on.
      const wasPending = group.filter((t) => t.status === TaskStatus.PENDING_APPROVAL);
      if (wasPending.length) {
        writes.push(
          db.approval.updateMany({
            where: { taskId: { in: wasPending.map((t) => t.id) }, type: "TASK_COMPLETION", status: OPEN_APPROVAL },
            data: {
              status: "CANCELLED",
              resolvedAt: now,
              comment:
                status === TaskStatus.COMPLETED
                  ? `Completed directly by ${user.name}.`
                  : `Withdrawn — task moved back to ${statusLabel(status)}.`,
            },
          })
        );
      }
    }
    await db.$transaction(writes);

    for (const { task, status } of direct) {
      const completed = status === TaskStatus.COMPLETED;
      activities.push({
        action: completed ? "task.completed" : "task.status_changed",
        entityType: "TASK",
        entityId: task.id,
        metadata: meta(task, status),
      });
      if (completed && task.createdById && task.createdById !== user.id) {
        notifications.push({ userId: task.createdById, message: `${user.name} completed "${task.title}"`, link: "/tasks" });
      }
      const creatorAlreadyNotified = completed && task.assigneeId === task.createdById;
      if (task.assigneeId !== user.id && !creatorAlreadyNotified) {
        notifications.push({
          userId: task.assigneeId,
          message: `${user.name} moved "${task.title}" to ${statusLabel(status)}`,
          link: "/tasks",
        });
      }
    }
  }

  await Promise.all([
    logActivities(user.id, activities),
    createNotificationRows(notifications),
    notifyAdminsOfEach(adminMessages),
  ]);

  return [...wanted.keys()].map((id) => results.get(id)!);
}
