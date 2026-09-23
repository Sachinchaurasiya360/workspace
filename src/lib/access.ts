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
    user.access === "ADMIN_TASK_BASED"
  );
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

export function assertTaskAccess(user: AuthedUser, task: { assigneeId: string }) {
  assertOwnerOrAdmin(user, task.assigneeId, "You can only manage your own tasks.");
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
