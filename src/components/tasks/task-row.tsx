import Link from "next/link";
import { AlertTriangle, MessageSquare } from "lucide-react";

import type { ActivityItem } from "@/components/activity/activity-list";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusLabel, TaskStatusSelect } from "@/components/tasks/task-status-select";
import { Badge } from "@/components/ui/badge";
import { canManageAll } from "@/lib/access";
import { PRIORITY_LABEL, isOverdue } from "@/lib/task-constants";
import { cn } from "@/lib/utils";
import type { AccessLevel, TaskPriority, TaskStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";

export const PRIORITY_VARIANT: Record<TaskPriority, "default" | "warning" | "destructive"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "destructive",
};

/** Grid columns for the task table (header and rows must share these). */
export const TASK_TABLE_COLS = {
  withAssignee: "lg:grid-cols-[minmax(0,1fr)_170px_150px_160px_80px_120px_44px]",
  withoutAssignee: "lg:grid-cols-[minmax(0,1fr)_170px_160px_80px_120px_44px]",
} as const;

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  projectId: string | null;
  project: { name: string } | null;
  lead?: { id: string; name: string } | null;
  assigneeId: string;
  assignee: { name: string };
  commentCount: number;
  /** Decided on the server from the viewer's role (see canEditTask / canDeleteTask). */
  canEdit: boolean;
  canDelete: boolean;
};

export type CommentData = { id: string; body: string; createdAt: Date; user: { name: string } | null };
export type CurrentUserData = { id: string; isFounder: boolean; access: AccessLevel };

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function DueLabel({ task, compact }: { task: Pick<TaskRowData, "dueDate" | "status">; compact?: boolean }) {
  if (!task.dueDate) return null;
  const overdue = isOverdue(task);
  return (
    <span className={cn("flex items-center gap-1", overdue && "font-semibold text-destructive")}>
      {overdue && <AlertTriangle className="size-3" />}
      {compact ? "" : overdue ? "Overdue · " : "Due "}
      {formatDate(new Date(task.dueDate))}
    </span>
  );
}

export function TaskRow({
  task,
  comments,
  projects,
  currentUser,
  showAssignee,
  members,
  history,
  variant = "list",
}: {
  task: TaskRowData;
  comments: CommentData[];
  projects: { id: string; name: string }[];
  currentUser: CurrentUserData;
  showAssignee?: boolean;
  members?: { id: string; name: string }[];
  history?: ActivityItem[];
  /** "table" renders a row of the All-tasks table; "list" is the compact stacked row used elsewhere. */
  variant?: "list" | "table";
}) {
  const isAdmin = canManageAll(currentUser);
  const { canEdit, canDelete } = task;
  const overdue = isOverdue(task);

  const titleDialog = (
    <TaskFormDialog
      mode="edit"
      task={task}
      projects={projects}
      comments={comments}
      canDelete={canDelete}
      readOnly={!canEdit}
      members={members}
      history={history}
      trigger={
        <button className="truncate text-left text-sm font-semibold text-foreground hover:text-primary">{task.title}</button>
      }
    />
  );
  const status = canEdit ? (
    <TaskStatusSelect taskId={task.id} status={task.status} canApproveDirectly={isAdmin} />
  ) : (
    <TaskStatusLabel status={task.status} />
  );

  if (variant === "table") {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 border-b border-[#EFEDE6] px-5 py-3 last:border-b-0 lg:grid lg:min-h-14 lg:items-center lg:gap-4 lg:py-2",
          showAssignee ? TASK_TABLE_COLS.withAssignee : TASK_TABLE_COLS.withoutAssignee,
          overdue && "bg-destructive/[0.025]"
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          {titleDialog}
          {task.lead && (
            <Link href={`/leads/${task.lead.id}`} className="truncate text-xs text-muted-foreground hover:text-primary">
              Lead: {task.lead.name}
            </Link>
          )}
        </div>
        {/* On phones the cells wrap as a meta line; from lg up they become grid cells. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:contents">
          <span className="min-w-0 truncate text-[13px] text-secondary-foreground">
            {task.project?.name ?? <span className="text-muted-foreground">No project</span>}
          </span>
          {showAssignee && (
            <span className="flex min-w-0 items-center gap-2 text-[13px]">
              <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground">
                {initials(task.assignee.name)}
              </span>
              <span className="truncate">{task.assignee.name}</span>
            </span>
          )}
          <span className="min-w-0">{status}</span>
          <span className="text-[13px] text-secondary-foreground">{PRIORITY_LABEL[task.priority]}</span>
          <span className={cn("text-[13px] font-medium text-secondary-foreground", !task.dueDate && "text-muted-foreground")}>
            {task.dueDate ? <DueLabel task={task} compact /> : "—"}
          </span>
          <span
            className="flex items-center gap-1 font-mono text-xs text-muted-foreground lg:justify-end"
            title={`${task.commentCount} comment${task.commentCount === 1 ? "" : "s"}`}
          >
            <MessageSquare className="size-3 lg:hidden" />
            {task.commentCount}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3",
        overdue && "border-destructive/40 bg-destructive/[0.03]"
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {titleDialog}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {task.project && <span>{task.project.name}</span>}
          {task.lead && (
            <Link href={`/leads/${task.lead.id}`} className="hover:underline">
              Lead: {task.lead.name}
            </Link>
          )}
          {showAssignee && <span>{task.assignee.name}</span>}
          <DueLabel task={task} />
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {task.commentCount}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
        {status}
      </div>
    </div>
  );
}
