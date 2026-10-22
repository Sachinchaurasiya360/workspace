import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import { ActivityList } from "@/components/activity/activity-list";
import { CommentSection } from "@/components/comments/comment-section";
import { DonutChart } from "@/components/charts/charts";
import { KanbanBoard, type KanbanTask } from "@/components/projects/kanban-board";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusChip } from "@/components/projects/project-status-chip";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { initials } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { LEAD_STAGE_LABEL, LEAD_STAGE_VARIANT } from "@/lib/lead-constants";
import { getProjectActivity } from "@/lib/activity";
import { getComments } from "@/lib/comments";
import { db } from "@/lib/db";
import { startOfToday } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { loadTaskFormOptions, loadTaskRows } from "@/lib/task-data";
import { STATUS_COLOR, STATUS_LABEL, TASK_STATUSES, isOverdue } from "@/lib/task-constants";
import { canViewProject } from "@/lib/visibility";
import { formatDate } from "@/lib/format";

export default async function ProjectBoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);

  // 404 rather than 403 so project ids can't be probed.
  if (!(await canViewProject(user, projectId))) notFound();

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { lead: { select: { name: true } }, members: { select: { id: true, name: true } } },
  });
  if (!project) notFound();

  const showLeads = isAdmin || hasSalesAccess(user);
  const [{ rows, commentsFor, historyFor }, options, projectComments, activity, people, leads] = await Promise.all([
    loadTaskRows(user, { projectId }, [{ createdAt: "desc" }], 500),
    loadTaskFormOptions(user),
    getComments("PROJECT", projectId),
    getProjectActivity(projectId, 25),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    showLeads
      ? db.lead.findMany({
          where: { projectId, ...(isAdmin ? {} : { ownerId: user.id }) },
          select: { id: true, name: true, company: true, stage: true, owner: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const total = rows.length;
  const completed = rows.filter((t) => t.status === "COMPLETED").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const canEditProject = isAdmin || project.leadId === user.id;
  // The project lead can assign within their project even without admin access.
  const members = options.members ?? (project.leadId === user.id ? people : undefined);
  const overdue = project.dueDate && project.overallStatus !== "COMPLETED" && project.dueDate < startOfToday();

  const kanbanTasks: KanbanTask[] = rows.map((t) => ({ ...t, comments: commentsFor(t.id), history: historyFor(t.id) }));

  const overdueTaskCount = rows.filter((t) => isOverdue(t)).length;
  const shownMembers = project.members.slice(0, 4);
  const extraMembers = project.members.length - shownMembers.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3.5">
        <nav aria-label="Breadcrumb" className="flex min-w-0 gap-2 text-[13px] text-muted-foreground">
          <Link href="/projects" className="font-medium text-muted-foreground hover:text-foreground">
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate font-medium text-foreground" aria-current="page">
            {project.name}
          </span>
        </nav>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[34px] sm:text-[40px]">{project.name}</h1>
              <ProjectStatusChip status={project.overallStatus} className="rounded-xl py-[5px]" />
              {canEditProject && (
                <ProjectFormDialog
                  mode="edit"
                  project={project}
                  people={people}
                  canChangeLead={isAdmin}
                  canDelete
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="Edit project">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] text-muted-foreground">
              <span>
                Lead <strong className="font-semibold text-foreground">{project.lead?.name ?? "Unassigned"}</strong>
              </span>
              {project.department && <span>{project.department}</span>}
              {(project.startDate || project.dueDate) && (
                <span className={overdue ? "font-semibold text-destructive" : undefined}>
                  {project.startDate ? formatDate(project.startDate) : "…"} – {project.dueDate ? formatDate(project.dueDate) : "no due date"}
                  {overdue ? " (past due)" : ""}
                </span>
              )}
              {project.targetMonth && (
                <span>
                  Target month <strong className="font-semibold text-foreground">{project.targetMonth}</strong>
                </span>
              )}
              <span className="font-mono text-xs">{project.projectCode}</span>
              {project.members.length > 0 && (
                <div className="flex" title={project.members.map((m) => m.name).join(", ")}>
                  <span className="sr-only">Members: {project.members.map((m) => m.name).join(", ")}</span>
                  {shownMembers.map((m, i) => (
                    <span
                      key={m.id}
                      aria-hidden
                      className={`flex size-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold ${AVATAR_TONES[i % AVATAR_TONES.length]} ${i > 0 ? "-ml-2" : ""}`}
                    >
                      {initials(m.name)}
                    </span>
                  ))}
                  {extraMembers > 0 && (
                    <span
                      aria-hidden
                      className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-semibold text-secondary-foreground"
                    >
                      +{extraMembers}
                    </span>
                  )}
                </div>
              )}
            </div>
            {project.notes && <p className="max-w-2xl text-sm text-muted-foreground">{project.notes}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex w-[180px] flex-col gap-1.5" title={`${completed} of ${total} tasks completed — updates automatically as tasks close.`}>
              <div className="flex justify-between text-[13px]">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-mono font-medium">{percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {completed} of {total} tasks done
              </span>
            </div>
            <TaskFormDialog
              mode="create"
              projects={options.projects.length ? options.projects : [{ id: project.id, name: project.name }]}
              members={members}
              defaultProjectId={projectId}
              trigger={
                <Button size="lg">
                  <Plus /> New task
                </Button>
              }
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3 border-b border-border">
          <h2 className="-mb-px flex h-11 items-center border-b-2 border-foreground text-sm font-semibold">Board</h2>
          {overdueTaskCount > 0 && (
            <span className="mb-2 flex h-9 items-center rounded-[9px] border border-[#EFD9A8] bg-warning-soft px-3 text-[13px] font-semibold text-[#7A4B00]">
              {overdueTaskCount} overdue
            </span>
          )}
        </div>
        <KanbanBoard tasks={kanbanTasks} projects={options.projects} members={members} isAdmin={isAdmin} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Tasks by stage</h2>
          <DonutChart
            height={140}
            centerLabel="tasks"
            data={TASK_STATUSES.map((s) => ({
              label: STATUS_LABEL[s],
              value: rows.filter((t) => t.status === s).length,
              color: STATUS_COLOR[s],
            }))}
          />
        </section>
        {leads.length > 0 && (
          <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-[17px] font-semibold">
              Leads <span className="font-mono text-sm font-medium text-muted-foreground">{leads.length}</span>
            </h2>
            <div className="flex flex-col">
              {leads.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="flex min-h-[52px] items-center justify-between gap-2 border-b border-[#EFEDE6] last:border-b-0 hover:text-primary"
                >
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {l.name}
                    {l.company && <span className="font-normal text-muted-foreground"> · {l.company}</span>}
                    {isAdmin && <span className="text-xs font-normal text-muted-foreground"> · {l.owner.name}</span>}
                  </span>
                  <Badge variant={LEAD_STAGE_VARIANT[l.stage]}>{LEAD_STAGE_LABEL[l.stage]}</Badge>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Discussion</h2>
          <CommentSection entityType="PROJECT" entityId={projectId} comments={projectComments} standalone />
        </section>
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Project activity</h2>
          <ActivityList items={activity} />
        </section>
      </div>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-[#DCE1F5] text-primary-strong",
  "bg-[#D5EFE4] text-[#135C40]",
  "bg-[#FBE7D2] text-[#8A4B00]",
  "bg-muted text-secondary-foreground",
];
