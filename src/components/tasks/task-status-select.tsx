"use client";

import { useTransition } from "react";

import { updateTaskStatus } from "@/actions/tasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskStatus } from "@prisma/client";

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  PENDING_APPROVAL: "Pending Approval",
  COMPLETED: "Completed",
};

export function TaskStatusSelect({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={isPending}
      onValueChange={(value) =>
        startTransition(async () => {
          await updateTaskStatus(taskId, value as TaskStatus);
        })
      }
    >
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(STATUS_LABEL) as TaskStatus[])
          .filter((s) => s !== "PENDING_APPROVAL")
          .map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        {status === "PENDING_APPROVAL" && (
          <SelectItem value="PENDING_APPROVAL">{STATUS_LABEL.PENDING_APPROVAL}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

export { STATUS_LABEL };
