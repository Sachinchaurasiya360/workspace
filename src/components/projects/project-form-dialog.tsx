"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

import { createProject, deleteProject, updateProject } from "@/actions/projects";
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
import type { ProjectStatus } from "@prisma/client";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } };
type ProjectRecord = {
  id: string;
  name: string;
  department: string | null;
  overallStatus: ProjectStatus;
  notes: string | null;
};

export function ProjectFormDialog({
  mode,
  project,
  comments,
  canDelete,
  trigger,
}: {
  mode: "create" | "edit";
  project?: ProjectRecord;
  comments?: CommentEntry[];
  canDelete?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [department, setDepartment] = useState(project?.department ?? "");
  const [overallStatus, setOverallStatus] = useState<ProjectStatus>(project?.overallStatus ?? "NOT_STARTED");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const payload = { name, department: department || null, overallStatus, notes: notes || null };
      const result =
        mode === "create" ? await createProject(payload) : await updateProject({ id: project!.id, ...payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleDelete() {
    if (!project) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteProject(project.id);
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
            <Plus /> Add project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add project" : "Edit project"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-department">Department / Workstream</Label>
            <Input id="project-department" value={department ?? ""} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Status</Label>
            <Select value={overallStatus} onValueChange={(v) => setOverallStatus(v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea id="project-notes" value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {mode === "edit" && project && (
            <CommentSection entityType="PROJECT" entityId={project.id} comments={comments ?? []} />
          )}
        </div>

        <DialogFooter>
          {mode === "edit" && canDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={submit} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Add project" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
