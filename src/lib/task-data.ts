import type { Prisma } from "@prisma/client";

import type { ActivityItem } from "@/components/activity/activity-list";
import type { CommentData, TaskRowData } from "@/components/tasks/task-row";
import { canDeleteTask, canEditTask, canManageAll } from "@/lib/access";
import { getActivity } from "@/lib/activity";
import { db } from "@/lib/db";

/**
 * Tasks plus everything a TaskRow needs (comments, comment counts, history),
 * fetched in a fixed number of queries however many tasks there are.
 */
type Viewer = { id: string; isFounder: boolean; access: Parameters<typeof canManageAll>[0]["access"] };

export async function loadTaskRows(
  viewer: Viewer,
  where: Prisma.TaskWhereInput,
  orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
  take = 200
) {
  const tasks = await db.task.findMany({
    where,
    orderBy,
    take,
    include: {
      project: { select: { name: true, leadId: true } },
      assignee: { select: { name: true } },
      lead: { select: { id: true, name: true } },
    },
  });
  const ids = tasks.map((t) => t.id);

  const [comments, history] = await Promise.all([
    ids.length
      ? db.comment.findMany({
          where: { entityType: "TASK", taskId: { in: ids } },
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    ids.length
      ? getActivity({ limit: 1000, where: { entityType: "TASK", entityId: { in: ids } } })
      : Promise.resolve([]),
  ]);

  const commentsByTask = new Map<string, CommentData[]>();
  for (const c of comments) {
    commentsByTask.set(c.taskId!, [...(commentsByTask.get(c.taskId!) ?? []), c]);
  }
  const historyByTask = new Map<string, ActivityItem[]>();
  for (const h of history) {
    historyByTask.set(h.entityId, [...(historyByTask.get(h.entityId) ?? []), h]);
  }

  const rows: TaskRowData[] = tasks.map((t) => ({
    ...t,
    commentCount: commentsByTask.get(t.id)?.length ?? 0,
    canEdit: canEditTask(viewer, t, t.project?.leadId),
    canDelete: canDeleteTask(viewer, t, t.project?.leadId),
  }));
  return {
    rows,
    commentsFor: (id: string) => commentsByTask.get(id) ?? [],
    historyFor: (id: string) => historyByTask.get(id) ?? [],
  };
}

/** Options for the task form's pickers. Members only when the viewer may assign to others. */
export async function loadTaskFormOptions(user: { id: string; isFounder: boolean; access: Parameters<typeof canManageAll>[0]["access"] }) {
  const isAdmin = canManageAll(user);
  const [projects, leadsAny, members] = await Promise.all([
    db.project.findMany({
      where: isAdmin
        ? {}
        : { OR: [{ leadId: user.id }, { members: { some: { id: user.id } } }, { tasks: { some: { assigneeId: user.id } } }] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    isAdmin ? Promise.resolve(0) : db.project.count({ where: { leadId: user.id } }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return { projects, members: isAdmin || leadsAny > 0 ? members : undefined };
}
