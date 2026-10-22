"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { updateTaskStatus } from "@/actions/tasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STATUS_COLOR, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-constants";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";

function StatusDot({ status }: { status: TaskStatus }) {
  return <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />;
}

export function TaskStatusSelect({
  taskId,
  status,
  canApproveDirectly,
  className,
}: {
  taskId: string;
  status: TaskStatus;
  /** Admins complete tasks straight away; everyone else goes through approval. */
  canApproveDirectly?: boolean;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={isPending}
      onValueChange={(value) =>
        startTransition(async () => {
          const next = value as TaskStatus;
          const result = await updateTaskStatus(taskId, next);
          if (!result.ok) {
            toast.error(result.error);
          } else if (next === "COMPLETED" && !canApproveDirectly) {
            toast.success("Sent for completion approval");
          } else {
            toast.success(`Moved to ${STATUS_LABEL[next]}`);
          }
        })
      }
    >
      <SelectTrigger
        className={cn("h-9 w-[150px] rounded-[9px] px-2.5 text-[13px] text-secondary-foreground", className)}
        aria-label="Task status"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <StatusDot status={status} />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUSES.filter((s) => s !== "PENDING_APPROVAL" || status === "PENDING_APPROVAL").map((s) => (
          <SelectItem key={s} value={s} disabled={s === "PENDING_APPROVAL"}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Read-only status: coloured dot + label, matching the select trigger. */
export function TaskStatusLabel({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-[13px] text-secondary-foreground", className)}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export { STATUS_LABEL };
