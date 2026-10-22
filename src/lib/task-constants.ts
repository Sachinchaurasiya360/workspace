import type { TaskPriority, TaskStatus } from "@prisma/client";

import { endOfDateOnly } from "@/lib/dates";

// Client-safe task vocab. Each status owns a fixed chart slot so its colour
// is the same on every chart.
export const TASK_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "PENDING_APPROVAL", "COMPLETED"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  REVIEW: "Review",
  PENDING_APPROVAL: "Pending Approval",
  COMPLETED: "Completed",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  TODO: "var(--chart-1)",
  IN_PROGRESS: "var(--chart-2)",
  REVIEW: "var(--chart-4)",
  PENDING_APPROVAL: "var(--chart-5)",
  COMPLETED: "var(--chart-3)",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

/** Overdue once the due date has fully passed in IST (same answer on server and browser). */
export function isOverdue(task: { dueDate: Date | string | null; status: TaskStatus }, now = new Date()) {
  if (!task.dueDate || task.status === "COMPLETED") return false;
  return now >= endOfDateOnly(new Date(task.dueDate));
}
