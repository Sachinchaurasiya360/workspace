import type { Prisma } from "@prisma/client";

import type { AuditMetadata } from "@/lib/audit";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { visibleProjectsWhere, visibleTasksWhere } from "@/lib/visibility";

export type ActivityEntry = {
  id: string;
  entityId: string;
  actorName: string;
  text: string;
  href: string | null;
  createdAt: Date;
};

const STATUS_WORD: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  PENDING_APPROVAL: "Pending Approval",
  COMPLETED: "Completed",
};

function describe(action: string, entityType: string, entityId: string, meta: AuditMetadata) {
  const label = `"${meta.label}"`;
  const taskHref = meta.projectId ? `/projects/${meta.projectId}` : "/tasks";
  switch (action) {
    case "task.created":
      return { text: `created task ${label}`, href: taskHref };
    case "task.updated":
      return { text: `updated task ${label}`, href: taskHref };
    case "task.assigned":
      return { text: `assigned ${label} to ${meta.targetUserName ?? "someone"}`, href: taskHref };
    case "task.reassigned":
      return { text: `reassigned ${label} to ${meta.targetUserName ?? "someone"}`, href: taskHref };
    case "task.status_changed":
      return { text: `moved ${label} to ${STATUS_WORD[meta.to ?? ""] ?? meta.to}`, href: taskHref };
    case "task.completed":
      return { text: `completed task ${label}`, href: taskHref };
    case "task.deleted":
      return { text: `deleted task ${label}`, href: null };
    case "project.created":
      return { text: `created project ${label}`, href: `/projects/${entityId}` };
    case "project.updated":
      return { text: `updated project ${label}`, href: `/projects/${entityId}` };
    case "project.deleted":
      return { text: `deleted project ${label}`, href: null };
    case "event.created":
      return { text: `added event ${label}`, href: "/discovery" };
    case "event.updated":
      return { text: `updated event ${label}`, href: "/discovery" };
    case "event.deleted":
      return { text: `deleted event ${label}`, href: null };
    case "event.registered":
      return { text: `registered for ${label}`, href: "/discovery" };
    case "event.attended":
      return { text: `attended ${label}`, href: "/discovery" };
    case "event.conducted":
      return { text: `conducted ${label}`, href: "/discovery" };
    case "approval.requested":
      return { text: `requested approval for ${label}`, href: "/approvals" };
    case "approval.approved":
      return { text: `approved ${meta.targetUserName ? `${meta.targetUserName}'s ` : ""}request ${label}`, href: "/approvals" };
    case "approval.rejected":
      return { text: `rejected ${meta.targetUserName ? `${meta.targetUserName}'s ` : ""}request ${label}`, href: "/approvals" };
    case "approval.discuss":
      return { text: `asked to discuss ${label}`, href: "/approvals" };
    case "daily_log.submitted":
      return { text: "submitted a daily update", href: "/daily-updates" };
    case "comment.added":
      return {
        text: `commented on ${entityType === "PROJECT" ? "project" : entityType === "EVENT" ? "event" : "task"} ${label}`,
        href: entityType === "PROJECT" ? `/projects/${entityId}` : entityType === "EVENT" ? "/discovery" : taskHref,
      };
    case "member.added":
      return { text: `added ${meta.label} to the team`, href: "/team" };
    case "member.updated":
      return { text: `updated ${meta.label}'s profile`, href: "/team" };
    case "member.deleted":
      return { text: `removed ${meta.label} from the workspace`, href: "/team" };
    case "lead.created":
      return { text: `added lead ${label}`, href: `/leads/${entityId}` };
    case "lead.updated":
      return { text: `updated lead ${label}`, href: `/leads/${entityId}` };
    case "lead.activity":
      return { text: `logged ${String(meta.activityType ?? "activity").toLowerCase().replace("_", "-")} on lead ${label}`, href: `/leads/${entityId}` };
    default:
      return { text: action, href: null };
  }
}

export async function getActivity({
  limit = 20,
  actorIds,
  where,
}: {
  limit?: number;
  /** Restrict to activity performed by these users (non-admin feeds). */
  actorIds?: string[];
  where?: Prisma.AuditLogWhereInput;
} = {}): Promise<ActivityEntry[]> {
  const rows = await db.auditLog.findMany({
    where: {
      ...(actorIds ? { actorId: { in: actorIds } } : {}),
      ...where,
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => {
    const meta = (row.metadata ?? { label: "" }) as AuditMetadata;
    const { text, href } = describe(row.action, row.entityType, row.entityId, meta);
    return { id: row.id, entityId: row.entityId, actorName: row.actor?.name ?? "Someone", text, href, createdAt: row.createdAt };
  });
}

/** Everything that happened to a project and to the tasks inside it. */
export function getProjectActivity(projectId: string, limit = 30) {
  return getActivity({
    limit,
    where: {
      OR: [
        { entityType: "PROJECT", entityId: projectId },
        { metadata: { path: ["projectId"], equals: projectId } },
      ],
    },
  });
}

export function getEntityActivity(entityType: string, entityId: string, limit = 20) {
  return getActivity({ limit, where: { entityType, entityId } });
}

export const ACTIVITY_KINDS = ["all", "tasks", "projects", "events", "approvals", "discussions", "updates", "leads"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const KIND_WHERE: Record<Exclude<ActivityKind, "all">, Prisma.AuditLogWhereInput> = {
  tasks: { entityType: "TASK", action: { not: "comment.added" } },
  projects: { entityType: "PROJECT", action: { not: "comment.added" } },
  events: { entityType: "EVENT", action: { not: "comment.added" } },
  approvals: { entityType: "APPROVAL" },
  discussions: { action: "comment.added" },
  updates: { entityType: "DAILY_LOG" },
  leads: { entityType: "LEAD" },
};

type Viewer = { id: string; isFounder: boolean; access: Parameters<typeof canManageAll>[0]["access"] };

/**
 * The workspace feed as this viewer may see it. Admins see everything;
 * everyone else sees their own actions, anything on projects and tasks
 * they can see, the shared event catalogue, and their own leads — never
 * other people's leads, daily updates or private approvals.
 */
export async function getVisibleActivity(
  viewer: Viewer,
  { limit = 30, kind = "all", actorId }: { limit?: number; kind?: ActivityKind; actorId?: string } = {}
) {
  const filters: Prisma.AuditLogWhereInput[] = [];
  if (kind !== "all") filters.push(KIND_WHERE[kind]);
  if (actorId) filters.push({ actorId });

  if (!canManageAll(viewer)) {
    const [projects, tasks, leads] = await Promise.all([
      db.project.findMany({ where: visibleProjectsWhere(viewer), select: { id: true } }),
      db.task.findMany({ where: visibleTasksWhere(viewer), select: { id: true }, orderBy: { updatedAt: "desc" }, take: 1000 }),
      db.lead.findMany({ where: { ownerId: viewer.id }, select: { id: true } }),
    ]);
    const projectIds = projects.map((p) => p.id);
    filters.push({
      OR: [
        { actorId: viewer.id },
        { entityType: "PROJECT", entityId: { in: projectIds } },
        { entityType: "TASK", entityId: { in: tasks.map((t) => t.id) } },
        ...projectIds.map((id) => ({ entityType: { in: ["TASK", "APPROVAL", "PROJECT"] }, metadata: { path: ["projectId"], equals: id } })),
        { entityType: "EVENT", action: { in: ["event.created", "event.updated", "comment.added"] } },
        { entityType: "LEAD", entityId: { in: leads.map((l) => l.id) } },
      ],
    });
  }

  return getActivity({ limit, where: { AND: filters } });
}
