import type { ApprovalStatus } from "@prisma/client";

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  REQUEST_RAISED: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  DISCUSS: "Discussion needed",
  CANCELLED: "Withdrawn",
};

export const APPROVAL_STATUS_VARIANT: Record<ApprovalStatus, "outline" | "success" | "destructive" | "warning"> = {
  REQUEST_RAISED: "outline",
  APPROVED: "success",
  REJECTED: "destructive",
  DISCUSS: "warning",
  CANCELLED: "outline",
};
