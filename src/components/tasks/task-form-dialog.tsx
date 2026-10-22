"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createTask, updateTask, deleteTask } from "@/actions/tasks";
import { CommentSection } from "@/components/comments/comment-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActivityList, type ActivityItem } from "@/components/activity/activity-list";
import { cn } from "@/lib/utils";

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
] as const;

type ProjectOption = { id: string; name: string };
type MemberOption = { id: string; name: string };
type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } | null };
type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  assigneeId?: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | string | null;
};

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function initialState(task: TaskRecord | undefined, defaultProjectId: string | undefined) {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    projectId: task?.projectId ?? defaultProjectId ?? "",
    assigneeId: task?.assigneeId ?? "",
    priority: task?.priority ?? ("MEDIUM" as const),
    dueDate: toDateInputValue(task?.dueDate),
  };
}

export function TaskFormDialog({
  mode,
  task,
  projects,
  comments,
  canDelete,
  readOnly,
  trigger,
  defaultProjectId,
  defaultLeadId,
  members,
  history,
}: {
  mode: "create" | "edit";
  task?: TaskRecord;
  projects: ProjectOption[];
  comments?: CommentEntry[];
  canDelete?: boolean;
  /** Viewer can see and comment on the task but not change it. */
  readOnly?: boolean;
  trigger?: React.ReactNode;
  defaultProjectId?: string;
  /** Creating from a lead page: the new task is linked to that lead. */
  defaultLeadId?: string;
  /** Present only when the viewer may assign tasks to others (admin / project lead). */
  members?: MemberOption[];
  history?: ActivityItem[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initialState(task, defaultProjectId));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Re-read the task every time the dialog opens: the server may have changed
  // it since mount, and unsaved edits from a cancelled session shouldn't linger.
  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(initialState(task, defaultProjectId));
      setError(null);
    }
    setOpen(next);
  }

  function submit() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        projectId: form.projectId || null,
        ...(mode === "create" && defaultLeadId ? { leadId: defaultLeadId } : {}),
        ...(members && form.assigneeId ? { assigneeId: form.assigneeId } : {}),
        priority: form.priority,
        dueDate: form.dueDate || null,
      };
      const result = mode === "create" ? await createTask(payload) : await updateTask({ id: task!.id, ...payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(mode === "create" ? "Task added" : "Task saved");
      setOpen(false);
    });
  }

  function handleDelete() {
    if (!task || !confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Task deleted");
      setOpen(false);
    });
  }

  const disabled = readOnly || isPending;
  // Keep the task's current project selectable even if it isn't in the viewer's list.
  const projectOptions =
    task?.projectId && !projects.some((p) => p.id === task.projectId)
      ? [...projects, { id: task.projectId, name: "Current project" }]
      : projects;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Add task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader className="pr-12">
          <DialogTitle>{mode === "create" ? "Add task" : readOnly ? "Task details" : "Edit task"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          {readOnly && (
            <p className="rounded-[14px] bg-primary-soft px-[18px] py-3.5 text-[13px] text-[#1F2B6E]">
              You can view and comment on this task. Its assignee, creator, project lead or an admin can change it.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              className="text-[15px]"
              value={form.title}
              disabled={disabled}
              onChange={(e) => set("title", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={form.description}
              disabled={disabled}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Project</Label>
              <Select value={form.projectId || "none"} disabled={disabled} onValueChange={(v) => set("projectId", v === "none" ? "" : v)}>
                <SelectTrigger aria-label="Project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {members && !readOnly && (
              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                <Select value={form.assigneeId || "me"} disabled={disabled} onValueChange={(v) => set("assigneeId", v === "me" ? "" : v)}>
                  <SelectTrigger aria-label="Assignee">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mode === "create" && <SelectItem value="me">Me</SelectItem>}
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label id="task-priority-label">Priority</Label>
              <div
                role="group"
                aria-labelledby="task-priority-label"
                className="flex h-11 gap-0.5 rounded-[10px] bg-background p-[3px]"
              >
                {PRIORITIES.map((p) => {
                  const active = form.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      aria-pressed={active}
                      disabled={disabled}
                      onClick={() => set("priority", p.value)}
                      className={cn(
                        "flex-1 rounded-lg text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        active
                          ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(23,24,28,0.1)]"
                          : "font-medium text-secondary-foreground hover:text-foreground"
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={form.dueDate} disabled={disabled} onChange={(e) => set("dueDate", e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {mode === "edit" && history && history.length > 0 && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-[#EFEDE6] bg-[#FBFAF7] px-4 py-3.5">
              <span className="text-[13px] font-semibold text-muted-foreground">History</span>
              <div className="max-h-40 overflow-y-auto">
                <ActivityList items={history} compact />
              </div>
            </div>
          )}
          {mode === "edit" && task && (
            <CommentSection entityType="TASK" entityId={task.id} comments={comments ?? []} />
          )}
        </div>

        {!readOnly && (
          <DialogFooter className="-mx-6 border-t border-[#EFEDE6] px-6 pt-4 sm:items-center">
            {mode === "edit" && (
              <span className="hidden text-[13px] text-muted-foreground sm:block">
                {(comments ?? []).length} comment{(comments ?? []).length === 1 ? "" : "s"}
              </span>
            )}
            {mode === "edit" && canDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
                Delete
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" size="lg" className="sm:ml-auto">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" size="lg" onClick={submit} disabled={isPending || !form.title.trim()}>
              {isPending && <Loader2 className="animate-spin" />}
              {mode === "create" ? "Add task" : "Save changes"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
