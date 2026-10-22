"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CalendarDays, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import { updateTaskStatus } from "@/actions/tasks";
import type { ActivityItem } from "@/components/activity/activity-list";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { initials, type CommentData, type TaskRowData } from "@/components/tasks/task-row";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { formatDate } from "@/lib/format";
import { PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, isOverdue } from "@/lib/task-constants";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus } from "@prisma/client";

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "PENDING_APPROVAL", "COMPLETED"];

const PRIORITY_CHIP: Record<TaskPriority, string> = {
  HIGH: "bg-foreground text-background",
  MEDIUM: "bg-primary-soft text-primary-strong",
  LOW: "bg-muted text-secondary-foreground",
};

export type KanbanTask = TaskRowData & { comments: CommentData[]; history: ActivityItem[] };

export function KanbanBoard({
  tasks,
  projects,
  members,
  isAdmin,
}: {
  tasks: KanbanTask[];
  projects: { id: string; name: string }[];
  members?: { id: string; name: string }[];
  isAdmin: boolean;
}) {
  const [optimisticTasks, moveTask] = useOptimistic(tasks, (state, move: { id: string; status: TaskStatus }) =>
    state.map((t) => (t.id === move.id ? { ...t, status: move.status } : t))
  );
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [, startTransition] = useTransition();

  const canEdit = (t: KanbanTask) => t.canEdit;

  function drop(status: TaskStatus, taskId: string) {
    setDragOver(null);
    const task = optimisticTasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    if (status === "PENDING_APPROVAL") {
      toast.error("Drag to Completed to request approval.");
      return;
    }
    // Non-admins completing a task land in Pending Approval.
    const shown = status === "COMPLETED" && !isAdmin ? "PENDING_APPROVAL" : status;
    startTransition(async () => {
      moveTask({ id: taskId, status: shown });
      const result = await updateTaskStatus(taskId, status);
      if (!result.ok) toast.error(result.error);
      else toast.success(shown === "PENDING_APPROVAL" ? "Sent for completion approval" : `Moved to ${STATUS_LABEL[status]}`);
    });
  }

  const hasPending = optimisticTasks.some((t) => t.status === "PENDING_APPROVAL");

  return (
    // Columns share the width on desktop; below that they keep a minimum width and the board scrolls sideways.
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3 xl:min-w-0">
        {COLUMNS.filter((c) => c !== "PENDING_APPROVAL" || hasPending).map((status) => {
          const columnTasks = optimisticTasks.filter((t) => t.status === status);
          return (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(status, e.dataTransfer.getData("text/task-id"));
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col gap-2.5 rounded-[14px] bg-[#ECEAE3] p-3 transition-colors xl:w-auto xl:min-w-0 xl:flex-1 xl:basis-0",
                dragOver === status && "bg-primary-soft ring-2 ring-primary/30"
              )}
            >
              <header className="flex items-center gap-2 px-1 py-0.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                <h2 className="text-[13px] font-semibold">{STATUS_LABEL[status]}</h2>
                <span className="font-mono text-xs text-muted-foreground">{columnTasks.length}</span>
              </header>

              <div className="flex min-h-24 flex-col gap-2.5">
                {columnTasks.length === 0 && (
                  <p className="rounded-[9px] border border-dashed border-[#C9C6BB] px-3 py-6 text-center text-[13px] font-medium text-muted-foreground">
                    Drop tasks here
                  </p>
                )}
                {columnTasks.map((t) => {
                  const overdue = isOverdue(t);
                  return (
                    <article
                      key={t.id}
                      draggable={canEdit(t)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/task-id", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "flex flex-col gap-3 rounded-[11px] border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(23,24,28,0.04)]",
                        canEdit(t) && "cursor-grab active:cursor-grabbing",
                        overdue && "border-destructive/40"
                      )}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", PRIORITY_CHIP[t.priority])}>
                          {PRIORITY_LABEL[t.priority]}
                        </span>
                        {overdue && (
                          <span className="rounded-md bg-[#FBE3DF] px-2 py-0.5 text-[11px] font-semibold text-[#9C2F24]">Overdue</span>
                        )}
                      </div>
                      <TaskFormDialog
                        mode="edit"
                        task={t}
                        projects={projects}
                        members={members}
                        comments={t.comments}
                        history={t.history}
                        canDelete={t.canDelete}
                        readOnly={!t.canEdit}
                        trigger={
                          <button className="text-left text-sm leading-[1.35] font-semibold text-foreground hover:text-primary">
                            {t.title}
                          </button>
                        }
                      />
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className={cn("flex items-center gap-1.5", overdue && "font-semibold text-destructive")}>
                          <CalendarDays className="size-3.5" />
                          {t.dueDate ? formatDate(new Date(t.dueDate)) : "No date"}
                        </span>
                        <span className="flex items-center gap-2.5">
                          <span className="flex items-center gap-1" title={`${t.commentCount} comments`}>
                            <MessageSquare className="size-3.5" />
                            {t.commentCount}
                          </span>
                          <span
                            title={t.assignee.name}
                            className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground"
                          >
                            {initials(t.assignee.name)}
                            <span className="sr-only"> ({t.assignee.name})</span>
                          </span>
                        </span>
                      </div>
                      {canEdit(t) && (
                        <TaskStatusSelect taskId={t.id} status={t.status} canApproveDirectly={isAdmin} className="w-full" />
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
