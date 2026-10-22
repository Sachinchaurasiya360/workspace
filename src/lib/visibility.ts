import type { Prisma } from "@prisma/client";

import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";

type Viewer = { id: string; isFounder: boolean; access: Parameters<typeof canManageAll>[0]["access"] };

/** Projects someone is involved in: ones they lead, are a member of, or hold a task in. */
export function involvedProjectsWhere(userId: string): Prisma.ProjectWhereInput {
  return {
    OR: [
      { leadId: userId },
      { members: { some: { id: userId } } },
      { tasks: { some: { assigneeId: userId } } },
    ],
  };
}

/** Admins see every project; everyone else sees the ones they're involved in. */
export function visibleProjectsWhere(user: Viewer): Prisma.ProjectWhereInput {
  return canManageAll(user) ? {} : involvedProjectsWhere(user.id);
}

/** Tasks a non-admin can see: assigned to or created by them, or in a project they lead or belong to. */
export function visibleTasksWhere(user: Viewer): Prisma.TaskWhereInput {
  if (canManageAll(user)) return {};
  return {
    OR: [
      { assigneeId: user.id },
      { createdById: user.id },
      { project: { leadId: user.id } },
      { project: { members: { some: { id: user.id } } } },
      // Holding any task in a project shows you that project's board, so its tasks too.
      { project: { tasks: { some: { assigneeId: user.id } } } },
    ],
  };
}

/** May this user file tasks under the project? Admins, its lead, and its members. */
export async function canContributeToProject(user: Viewer, projectId: string) {
  if (canManageAll(user)) return !!(await db.project.findUnique({ where: { id: projectId }, select: { id: true } }));
  const found = await db.project.findFirst({
    where: { id: projectId, OR: [{ leadId: user.id }, { members: { some: { id: user.id } } }] },
    select: { id: true },
  });
  return !!found;
}

export async function canViewProject(user: Viewer, projectId: string) {
  const found = await db.project.findFirst({
    where: { AND: [{ id: projectId }, visibleProjectsWhere(user)] },
    select: { id: true },
  });
  return !!found;
}

export async function canViewTask(user: Viewer, taskId: string) {
  const found = await db.task.findFirst({
    where: { AND: [{ id: taskId }, visibleTasksWhere(user)] },
    select: { id: true },
  });
  return !!found;
}
