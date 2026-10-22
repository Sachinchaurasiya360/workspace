"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertIsAdmin } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

const reviewSchema = z.object({
  approvalId: z.string(),
  decision: z.enum(["approve", "reject", "discuss"]),
  comment: z.string().max(4000).optional().nullable(),
});

const DECISION_STATUS = { approve: "APPROVED", reject: "REJECTED", discuss: "DISCUSS" } as const;
const DECISION_ACTION = { approve: "approval.approved", reject: "approval.rejected", discuss: "approval.discuss" } as const;
const DECISION_WORD = { approve: "approved", reject: "rejected", discuss: "marked for discussion" } as const;

/**
 * Approve / Reject resolve the request. Discuss keeps it open (status
 * DISCUSS) so the founder can still approve or reject after talking it over.
 */
export async function reviewApproval(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertIsAdmin(user, "Only an admin can review approvals.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { approvalId, decision } = parsed.data;
  const comment = parsed.data.comment?.trim() || null;
  if (decision === "discuss" && !comment) {
    return { ok: false, error: "Add a comment explaining what needs discussing." };
  }

  const approval = await db.approval.findUnique({
    where: { id: approvalId },
    include: {
      task: { select: { title: true, projectId: true, status: true } },
      event: { select: { name: true } },
      requestedBy: { select: { name: true } },
    },
  });
  if (!approval) return { ok: false, error: "Approval not found" };

  // A completion request whose task was reopened or completed meanwhile can't
  // be decided any more — withdraw it instead of recording a hollow decision.
  if (approval.type === "TASK_COMPLETION" && approval.task && approval.task.status !== "PENDING_APPROVAL") {
    await db.approval.updateMany({
      where: { id: approvalId, status: { in: ["REQUEST_RAISED", "DISCUSS"] } },
      data: { status: "CANCELLED", resolvedAt: new Date(), comment: "Withdrawn — the task's status changed before a decision." },
    });
    revalidatePath("/approvals");
    revalidatePath("/", "layout");
    return { ok: false, error: "This task has already moved on, so the request was withdrawn." };
  }

  const resolves = decision !== "discuss";

  // Claim the request atomically: only the first reviewer's decision lands,
  // even if two admins act at the same moment.
  const claimed = await db.approval.updateMany({
    where: { id: approvalId, status: { in: ["REQUEST_RAISED", "DISCUSS"] } },
    data: {
      status: DECISION_STATUS[decision],
      approvedById: user.id,
      comment: comment ?? approval.comment,
      resolvedAt: resolves ? new Date() : null,
    },
  });
  if (claimed.count === 0) return { ok: false, error: "This request was already resolved." };

  // Only move the task if it's still waiting on this decision — it may have
  // been reopened or completed by an admin in the meantime.
  if (approval.type === "TASK_COMPLETION" && approval.taskId && resolves && approval.task?.status === "PENDING_APPROVAL") {
    await db.task.update({
      where: { id: approval.taskId },
      data: decision === "approve" ? { status: "COMPLETED", completedAt: new Date() } : { status: "REVIEW", completedAt: null },
    });
  }

  if (approval.type === "EVENT_ATTENDANCE" && approval.eventId && approval.requestedById && decision === "approve") {
    const existing = await db.eventOverview.findUnique({
      where: { userId_eventId: { userId: approval.requestedById, eventId: approval.eventId } },
    });
    // Registration only touches the participation track, and never downgrades "Attended".
    if (!existing?.participation) {
      await db.eventOverview.upsert({
        where: { userId_eventId: { userId: approval.requestedById, eventId: approval.eventId } },
        update: { participation: "REGISTERED" },
        create: { userId: approval.requestedById, eventId: approval.eventId, participation: "REGISTERED" },
      });
    }
  }

  const label = approval.task?.title ?? approval.event?.name ?? "request";
  await logActivity(user.id, DECISION_ACTION[decision], "APPROVAL", approvalId, {
    label,
    projectId: approval.task?.projectId ?? null,
    targetUserName: approval.requestedBy?.name ?? null,
  });
  if (approval.requestedById) {
    await createNotification(
      approval.requestedById,
      `Your request "${label}" was ${DECISION_WORD[decision]}${comment ? `: ${comment}` : ""}`,
      "/approvals"
    );
  }

  revalidatePath("/");
  revalidatePath("/approvals");
  revalidatePath("/discovery");
  revalidatePath("/tasks");
  revalidatePath("/projects", "layout");
  return { ok: true };
}
