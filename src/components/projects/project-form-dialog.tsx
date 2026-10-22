"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createProject, deleteProject, updateProject } from "@/actions/projects";
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
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@prisma/client";

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } | null };
type ProjectRecord = {
  id: string;
  name: string;
  department: string | null;
  overallStatus: ProjectStatus;
  notes: string | null;
  leadId: string | null;
  startDate: Date | string | null;
  dueDate: Date | string | null;
  targetMonth: string | null;
  members?: { id: string }[];
};

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function ProjectFormDialog({
  mode,
  project,
  comments,
  canDelete,
  trigger,
  people,
  canChangeLead,
}: {
  mode: "create" | "edit";
  project?: ProjectRecord;
  comments?: CommentEntry[];
  canDelete?: boolean;
  trigger?: React.ReactNode;
  /** Active team members, for the lead and member pickers. */
  people: { id: string; name: string }[];
  /** Only admins can hand a project to a different lead. */
  canChangeLead?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [department, setDepartment] = useState(project?.department ?? "");
  const [overallStatus, setOverallStatus] = useState<ProjectStatus>(project?.overallStatus ?? "NOT_STARTED");
  const [notes, setNotes] = useState(project?.notes ?? "");
  const [leadId, setLeadId] = useState(project?.leadId ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(project?.members?.map((m) => m.id) ?? []);
  const [startDate, setStartDate] = useState(toDateInputValue(project?.startDate));
  const [dueDate, setDueDate] = useState(toDateInputValue(project?.dueDate));
  const [targetMonth, setTargetMonth] = useState(project?.targetMonth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetFromProps() {
    setName(project?.name ?? "");
    setDepartment(project?.department ?? "");
    setOverallStatus(project?.overallStatus ?? "NOT_STARTED");
    setNotes(project?.notes ?? "");
    setLeadId(project?.leadId ?? "");
    setMemberIds(project?.members?.map((m) => m.id) ?? []);
    setStartDate(toDateInputValue(project?.startDate));
    setDueDate(toDateInputValue(project?.dueDate));
    setTargetMonth(project?.targetMonth ?? "");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const payload = {
        name,
        department: department || null,
        overallStatus,
        notes: notes || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        targetMonth: targetMonth || null,
        memberIds,
        ...(canChangeLead && leadId ? { leadId } : {}),
      };
      const result =
        mode === "create" ? await createProject(payload) : await updateProject({ id: project!.id, ...payload });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(mode === "create" ? "Project created" : "Project saved");
      setOpen(false);
    });
  }

  function handleDelete() {
    if (!project) return;
    setError(null);
    startTransition(async () => {
      if (!confirm(`Delete "${project.name}"? Its tasks will be kept but unlinked.`)) return;
      const result = await deleteProject(project.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Project deleted");
      setOpen(false);
      router.push("/projects");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) resetFromProps();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus /> Add project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader className="pr-12">
          <DialogTitle>{mode === "create" ? "Add project" : "Edit project"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              className="text-[15px]"
              placeholder="e.g. Q1 Enterprise Push"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className={cn("flex flex-col gap-1.5", !canChangeLead && "sm:col-span-2")}>
            <Label htmlFor="project-department">Department / Workstream</Label>
            <Input id="project-department" value={department ?? ""} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          {canChangeLead && (
            <div className="flex flex-col gap-1.5">
              <Label>Project lead</Label>
              <Select value={leadId || "me"} onValueChange={(v) => setLeadId(v === "me" ? "" : v)}>
                <SelectTrigger aria-label="Project lead">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mode === "create" && <SelectItem value="me">Me</SelectItem>}
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-start">Start date</Label>
            <Input id="project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-due">Target / due date</Label>
            <Input id="project-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-month">Target month</Label>
            <Input id="project-month" type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={overallStatus} onValueChange={(v) => setOverallStatus(v as ProjectStatus)}>
              <SelectTrigger aria-label="Status">
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
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="mb-2 text-[13px] font-semibold">
              Team members
              {memberIds.length > 0 && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{memberIds.length}</span>}
            </legend>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-[10px] border border-input p-2">
              {people.length === 0 && <span className="px-1 text-[13px] text-muted-foreground">No active team members.</span>}
              {people.map((p) => (
                <label
                  key={p.id}
                  className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-lg border border-transparent bg-background px-2.5 text-[13px] font-medium text-secondary-foreground transition-colors select-none hover:bg-muted has-[:checked]:border-primary/30 has-[:checked]:bg-primary-soft has-[:checked]:text-primary-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={memberIds.includes(p.id)}
                    onChange={(e) =>
                      setMemberIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                    }
                  />
                  <Check aria-hidden className="hidden size-3.5 peer-checked:block" />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="project-notes">Notes</Label>
            <Textarea
              id="project-notes"
              placeholder="Goals, context, links"
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          {mode === "edit" && project && comments && (
            <div className="sm:col-span-2">
              <CommentSection entityType="PROJECT" entityId={project.id} comments={comments} />
            </div>
          )}
        </div>

        <DialogFooter className="-mx-6 border-t border-[#EFEDE6] px-6 pt-4 sm:items-center">
          {mode === "edit" && canDelete && (
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <DialogClose asChild>
            <Button type="button" variant="outline" size="lg">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" size="lg" onClick={submit} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Add project" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
