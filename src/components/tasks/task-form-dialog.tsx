"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

import { createTask, updateTask, deleteTask } from "@/actions/tasks";
import { CommentSection } from "@/components/comments/comment-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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

type ProjectOption = { id: string; name: string };
type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } };
type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  projectId: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  dueDate: Date | string | null;
};

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function TaskFormDialog({
  mode,
  task,
  projects,
  comments,
  canDelete,
  trigger,
  defaultProjectId,
}: {
  mode: "create" | "edit";
  task?: TaskRecord;
  projects: ProjectOption[];
  comments?: CommentEntry[];
  canDelete?: boolean;
  trigger?: React.ReactNode;
  defaultProjectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? defaultProjectId ?? "");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">(task?.priority ?? "MEDIUM");
  const [dueDate, setDueDate] = useState(toDateInputValue(task?.dueDate));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const payload = {
        title,
        description: description || null,
        projectId: projectId || null,
        priority,
        dueDate: dueDate || null,
      };
      const result =
        mode === "create" ? await createTask(payload) : await updateTask({ id: task!.id, ...payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleDelete() {
    if (!task) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Add task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add task" : "Edit task"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <Select value={projectId || "none"} onValueChange={(v) => setProjectId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-due">Due date</Label>
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {mode === "edit" && task && (
            <CommentSection entityType="TASK" entityId={task.id} comments={comments ?? []} />
          )}
        </div>

        <DialogFooter>
          {mode === "edit" && canDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={submit} disabled={isPending || !title.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Add task" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
