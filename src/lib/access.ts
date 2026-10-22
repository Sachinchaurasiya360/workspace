import type { AccessLevel } from "@prisma/client";

export class ForbiddenError extends Error {
  constructor(message = "You don't have access to this record.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

type AuthedUser = {
  id: string;
  isFounder: boolean;
  access: AccessLevel;
};

/** Founders and admin-access users can see/manage everyone's records. */
export function canManageAll(user: AuthedUser) {
  return (
    user.isFounder ||
    user.access === "ADMIN" ||
    user.access === "ADMIN_TASK_BASED" ||
    user.access === "ADMIN_SALES_BASED"
  );
}

/** Sales-access users get the sales/KPI dashboard and the Leads module. */
export function hasSalesAccess(user: Pick<AuthedUser, "access">) {
  return (
    user.access === "SALES_BASED" ||
    user.access === "SALES_TASK_BASED" ||
    user.access === "ADMIN_SALES_BASED"
  );
}

/** Task-access users get the task/project operational dashboard. */
export function hasTaskAccess(user: Pick<AuthedUser, "access">) {
  return (
    user.access === "TASK_BASED" ||
    user.access === "ADMIN_TASK_BASED" ||
    user.access === "SALES_TASK_BASED" ||
    user.access === "ENGINEERING"
  );
}

export function isEngineering(user: Pick<AuthedUser, "access">) {
  return user.access === "ENGINEERING";
}

export function assertOwnerOrAdmin(
  user: AuthedUser,
  ownerId: string | null | undefined,
  message?: string
) {
  if (canManageAll(user)) return;
  if (ownerId && ownerId === user.id) return;
  throw new ForbiddenError(message);
}

type TaskOwnership = { assigneeId: string; createdById: string | null };

/** Edit details, reassign or change status: admin, assignee, creator, or the project's lead. */
export function canEditTask(user: AuthedUser, task: TaskOwnership, projectLeadId?: string | null) {
  return (
    canManageAll(user) ||
    task.assigneeId === user.id ||
    task.createdById === user.id ||
    (!!projectLeadId && projectLeadId === user.id)
  );
}

/** Delete: admin, creator, or the project's lead — not an assignee handed the task by someone else. */
export function canDeleteTask(user: AuthedUser, task: TaskOwnership, projectLeadId?: string | null) {
  return canManageAll(user) || task.createdById === user.id || (!!projectLeadId && projectLeadId === user.id);
}

export function assertTaskAccess(user: AuthedUser, task: TaskOwnership, projectLeadId?: string | null) {
  if (!canEditTask(user, task, projectLeadId)) throw new ForbiddenError("You don't have access to this task.");
}

export function assertProjectAccess(
  user: AuthedUser,
  project: { leadId: string | null }
) {
  assertOwnerOrAdmin(user, project.leadId, "Only the project lead or an admin can manage this project.");
}

export function assertEventOverviewAccess(
  user: AuthedUser,
  overview: { userId: string }
) {
  assertOwnerOrAdmin(user, overview.userId, "You can only manage your own event overview entries.");
}

/** Guards viewing another team member's dashboard (?viewAs=<userId>). */
export function assertDashboardAccess(user: AuthedUser, targetUserId: string) {
  assertOwnerOrAdmin(user, targetUserId, "You can only view your own dashboard.");
}

export function assertIsAdmin(user: AuthedUser, message?: string) {
  if (!canManageAll(user)) {
    throw new ForbiddenError(message ?? "Only an admin can perform this action.");
  }
}
