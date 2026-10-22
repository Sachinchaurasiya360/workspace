import type { LeadStage } from "@prisma/client";

import { LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { cn } from "@/lib/utils";

/** Stage colours from the Leads design. */
export const LEAD_STAGE_CHIP: Record<LeadStage, string> = {
  NEW: "bg-muted text-secondary-foreground",
  CONTACTED: "bg-[#E3EEFA] text-[#1D4F8C]",
  MEETING: "bg-primary-soft text-primary-strong",
  PROPOSAL: "bg-warning-soft text-[#7A4B00]",
  WON: "bg-[#D5EFE4] text-[#135C40]",
  LOST: "bg-[#F4E2E0] text-[#8C2A20]",
};

export function LeadStageChip({ stage, className }: { stage: LeadStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-lg px-[9px] py-[3px] text-xs font-semibold whitespace-nowrap",
        LEAD_STAGE_CHIP[stage],
        className
      )}
    >
      {LEAD_STAGE_LABEL[stage]}
    </span>
  );
}
