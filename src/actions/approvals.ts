"use server";

import { revalidatePath } from "next/cache";

import { assertIsAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

export async function reviewApproval(approvalId: string, decision: "approve" | "reject"): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertIsAdmin(user, "Only an admin can review approvals.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const approval = await db.approval.findUnique({ where: { id: approvalId } });
  if (!approval) return { ok: false, error: "Approval not found" };
  if (approval.status !== "REQUEST_RAISED") return { ok: false, error: "This request was already resolved." };

  const status = decision === "approve" ? "APPROVED" : "REJECTED";

  await db.approval.update({
    where: { id: approvalId },
    data: { status, approvedById: user.id, resolvedAt: new Date() },
  });

  if (approval.type === "TASK_COMPLETION" && approval.taskId) {
    await db.task.update({
      where: { id: approval.taskId },
      data: { status: decision === "approve" ? "COMPLETED" : "REVIEW" },
    });
  }

  if (approval.type === "EVENT_ATTENDANCE" && approval.eventId && decision === "approve") {
    await db.eventOverview.upsert({
      where: { userId_eventId: { userId: approval.requestedById, eventId: approval.eventId } },
      update: { status: "REGISTERED" },
      create: { userId: approval.requestedById, eventId: approval.eventId, status: "REGISTERED" },
    });
  }

  revalidatePath("/");
  revalidatePath("/discovery");
  return { ok: true };
}
