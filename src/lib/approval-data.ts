import type { Prisma } from "@prisma/client";

import type { ApprovalRow } from "@/components/approvals/approval-queue";
import { db } from "@/lib/db";

export const APPROVAL_INCLUDE = {
  requestedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  task: { select: { title: true, projectId: true, dueDate: true, project: { select: { name: true } } } },
  event: { select: { name: true, date: true, city: true, venue: true, price: true, link: true } },
} satisfies Prisma.ApprovalInclude;

export async function loadApprovals(where: Prisma.ApprovalWhereInput, take = 100) {
  const rows = await db.approval.findMany({ where, include: APPROVAL_INCLUDE, orderBy: { createdAt: "desc" }, take });
  // Structural check: every row satisfies what the approval cards render.
  return rows satisfies ApprovalRow[];
}
