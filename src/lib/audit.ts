import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type AuditEntity = "TASK" | "PROJECT" | "EVENT" | "APPROVAL" | "DAILY_LOG" | "COMMENT" | "USER" | "LEAD";

export type AuditAction =
  | "task.created"
  | "task.updated"
  | "task.assigned"
  | "task.reassigned"
  | "task.status_changed"
  | "task.completed"
  | "task.deleted"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "event.created"
  | "event.updated"
  | "event.deleted"
  | "event.registered"
  | "event.attended"
  | "event.conducted"
  | "approval.requested"
  | "approval.approved"
  | "approval.rejected"
  | "approval.discuss"
  | "daily_log.submitted"
  | "comment.added"
  | "member.added"
  | "member.updated"
  | "member.deleted"
  | "lead.created"
  | "lead.updated"
  | "lead.activity";

/**
 * Metadata always carries a human `label` (task title, project name…) so the
 * activity feed can render without re-joining — and still reads correctly
 * after the underlying record is deleted. `projectId` lets project pages pull
 * the history of their tasks too.
 */
export type AuditMetadata = {
  label: string;
  projectId?: string | null;
  from?: string | null;
  to?: string | null;
  targetUserName?: string | null;
  [key: string]: string | number | boolean | null | undefined;
};

export type AuditEntry = { action: AuditAction; entityType: AuditEntity; entityId: string; metadata: AuditMetadata };

/** Several entries in one insert. Like logActivity, never throws. */
export async function logActivities(actorId: string | null, entries: AuditEntry[]) {
  if (entries.length === 0) return;
  try {
    await db.auditLog.createMany({
      data: entries.map((e) => ({ actorId, ...e, metadata: e.metadata as Prisma.InputJsonValue })),
    });
  } catch (error) {
    console.error("Failed to write audit logs", entries.map((e) => e.action), error);
  }
}

export async function logActivity(
  actorId: string | null,
  action: AuditAction,
  entityType: AuditEntity,
  entityId: string,
  metadata: AuditMetadata
) {
  // Activity logging must never break the action that triggered it.
  try {
    await db.auditLog.create({
      data: { actorId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue },
    });
  } catch (error) {
    console.error("Failed to write audit log", action, error);
  }
}
