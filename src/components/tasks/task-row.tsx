import { MessageSquare } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusSelect } from "@/components/tasks/task-status-select";
import { canManageAll } from "@/lib/access";
import type { TaskPriority, TaskStatus } from "@prisma/client";

const PRIORITY_VARIANT: Record<TaskPriority, "default" | "warning" | "destructive"> = {
  LOW: "default",
  MEDIUM: "warning",
  HIGH: "destructive",
};

export type TaskRowData = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  projectId: string | null;
  project: { name: string } | null;
  assigneeId: string;
  assignee: { name: string };
  commentCount: number;
};

export function TaskRow({
  task,
  comments,
  projects,
  currentUser,
  showAssignee,
}: {
  task: TaskRowData;
  comments: { id: string; body: string; createdAt: Date; user: { name: string } }[];
  projects: { id: string; name: string }[];
  currentUser: { id: string; isFounder: boolean; access: string };
  showAssignee?: boolean;
}) {
  const canEdit = canManageAll(currentUser as never) || task.assigneeId === currentUser.id;

  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <TaskFormDialog
          mode="edit"
          task={task}
          projects={projects}
          comments={comments}
          canDelete={canEdit}
          trigger={
            <button className="truncate text-left text-sm font-medium hover:underline">{task.title}</button>
          }
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.project && <span>{task.project.name}</span>}
          {showAssignee && <span>{task.assignee.name}</span>}
          {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
          {task.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {task.commentCount}
            </span>
          )}
        </div>
      </div>
      <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
      <TaskStatusSelect taskId={task.id} status={task.status} />
    </div>
  );
}
