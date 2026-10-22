import type { AccessLevel, LeadActivityType, LeadStage } from "@prisma/client";

/** Access levels that can own leads (admins can too, via "Me"). */
export const LEAD_OWNER_ACCESS: AccessLevel[] = ["SALES_BASED", "SALES_TASK_BASED", "ADMIN_SALES_BASED"];

export const LEAD_STAGES: LeadStage[] = ["NEW", "CONTACTED", "MEETING", "PROPOSAL", "WON", "LOST"];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  MEETING: "Meeting",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
};

export const LEAD_STAGE_VARIANT: Record<LeadStage, "default" | "primary" | "success" | "destructive" | "outline"> = {
  NEW: "outline",
  CONTACTED: "default",
  MEETING: "primary",
  PROPOSAL: "primary",
  WON: "success",
  LOST: "destructive",
};

export const LEAD_ACTIVITY_LABEL: Record<LeadActivityType, string> = {
  CALL: "Call",
  FOLLOW_UP: "Follow-up",
  MEETING: "Meeting",
  NOTE: "Note",
};
