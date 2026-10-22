import type { ProjectStatus } from "@prisma/client";

import { PROJECT_STATUS_LABEL } from "@/lib/project-constants";
import { cn } from "@/lib/utils";

const TONE: Record<ProjectStatus, string> = {
  IN_PROGRESS: "bg-[#FDEBE2] text-[#9A3E12]",
  NOT_STARTED: "bg-[#E3EEFA] text-[#1D4F8C]",
  ON_HOLD: "bg-muted text-secondary-foreground",
  COMPLETED: "bg-[#D5EFE4] text-[#135C40]",
};

export function ProjectStatusChip({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap rounded-[10px] px-2.5 py-1 text-xs font-semibold", TONE[status], className)}>
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}
