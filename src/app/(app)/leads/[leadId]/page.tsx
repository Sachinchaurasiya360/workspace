import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { LeadStage } from "@prisma/client";
import { Pencil } from "lucide-react";

import { LeadFormDialog, LogLeadActivityForm } from "@/components/leads/lead-forms";
import { timeAgo } from "@/components/activity/activity-list";
import { Button } from "@/components/ui/button";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { addDays, startOfToday } from "@/lib/events";
import { LEAD_ACTIVITY_LABEL, LEAD_OWNER_ACCESS, LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { getCurrentUser } from "@/lib/session";
import { loadTaskFormOptions, loadTaskRows } from "@/lib/task-data";
import { visibleProjectsWhere, visibleTasksWhere } from "@/lib/visibility";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      owner: { select: { name: true } },
      project: { select: { id: true, name: true } },
      activities: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead || (!isAdmin && lead.ownerId !== user.id)) notFound();

  const owners = isAdmin
    ? await db.user.findMany({
        // Anyone who can own leads, plus the current owner so the picker never shows blank.
        where: { isActive: true, OR: [{ access: { in: LEAD_OWNER_ACCESS } }, { id: lead.ownerId }] },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : undefined;

  const [tasks, options, projects] = await Promise.all([
    loadTaskRows(user, { AND: [{ leadId: lead.id }, visibleTasksWhere(user)] }, [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }], 50),
    loadTaskFormOptions(user),
    db.project.findMany({ where: visibleProjectsWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const followUpDue =
    !!lead.nextFollowUp && lead.nextFollowUp < addDays(startOfToday(), 1) && lead.stage !== "WON" && lead.stage !== "LOST";

  const facts = [
    { label: "Company", value: lead.company },
    { label: "Deal value", value: lead.value !== null ? <span className="font-mono">{inr.format(lead.value)}</span> : null },
    {
      label: "Email",
      value: lead.email ? (
        <a href={`mailto:${lead.email}`} className="break-all text-primary hover:text-primary-strong">
          {lead.email}
        </a>
      ) : null,
    },
    {
      label: "Phone",
      value: lead.phone ? (
        <a href={`tel:${lead.phone}`} className="text-primary hover:text-primary-strong">
          {lead.phone}
        </a>
      ) : null,
    },
    { label: "Owner", value: lead.owner.name },
    { label: "Source", value: lead.source },
    {
      label: "Project",
      value: lead.project ? (
        <Link href={`/projects/${lead.project.id}`} className="text-primary hover:text-primary-strong">
          {lead.project.name}
        </Link>
      ) : null,
    },
    {
      label: "Next follow-up",
      value: lead.nextFollowUp ? (
        <span className={followUpDue ? "font-semibold text-[#8A4B00]" : undefined}>
          {formatDate(lead.nextFollowUp, { dateStyle: "medium" })}
        </span>
      ) : null,
    },
    { label: "Added", value: formatDate(lead.createdAt) },
  ].filter((f) => f.value);

  // Stage progress: the open path to Won, with Lost appended only when the deal was lost.
  const steps: LeadStage[] = LEAD_STAGES.filter((s) => s !== "LOST");
  if (lead.stage === "LOST") steps.push("LOST");
  const currentIndex = steps.indexOf(lead.stage);

  return (
    <div className="flex flex-col gap-[22px]">
      <nav aria-label="Breadcrumb" className="flex min-w-0 gap-2 text-[13px] text-muted-foreground">
        <Link href="/leads" className="font-medium hover:text-foreground">
          Leads
        </Link>
        <span aria-hidden>/</span>
        <span className="truncate font-medium text-foreground">{lead.name}</span>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="font-display text-[34px] sm:text-[44px]">{lead.name}</h1>
          <span className="text-[15px] text-muted-foreground">
            {[lead.company, `Owner ${lead.owner.name}`].filter(Boolean).join(" · ")}
          </span>
        </div>
        <LeadFormDialog
          mode="edit"
          lead={lead}
          owners={owners}
          projects={projects}
          trigger={
            <Button variant="outline" size="lg">
              <Pencil /> Edit lead
            </Button>
          }
        />
      </header>

      <ol
        aria-label="Stage"
        className="m-0 grid list-none grid-cols-3 gap-1 p-0 sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none"
      >
        {steps.map((s, i) => {
          const state = lead.stage === "LOST" ? (s === "LOST" ? "lost" : "next") : i < currentIndex ? "done" : i === currentIndex ? "now" : "next";
          return (
            <li
              key={s}
              aria-current={state === "now" || state === "lost" ? "step" : undefined}
              className={cn(
                "flex h-14 min-w-0 flex-col justify-center gap-0.5 rounded-[10px] px-3.5 sm:rounded-none sm:first:rounded-l-[10px] sm:last:rounded-r-[10px]",
                state === "now" && "bg-primary text-primary-foreground",
                state === "done" && "bg-[#DCE1F5] text-[#1F2B6E]",
                state === "next" && "border border-border bg-card text-muted-foreground",
                state === "lost" && "bg-destructive text-destructive-foreground"
              )}
            >
              <span className="truncate text-xs font-semibold">{LEAD_STAGE_LABEL[s]}</span>
              <span className="truncate text-xs opacity-80">
                {state === "done" ? "Done" : state === "now" || state === "lost" ? "Current stage" : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-5">
          <div className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-[17px] font-semibold">Details</h2>
            <dl className="m-0 grid grid-cols-[110px_minmax(0,1fr)] gap-y-3 text-sm sm:grid-cols-[130px_minmax(0,1fr)]">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="m-0 min-w-0">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          {lead.notes && (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-6">
              <h2 className="text-[17px] font-semibold">Notes</h2>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-secondary-foreground">{lead.notes}</p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-[18px] rounded-2xl border border-border bg-card p-6 lg:col-span-7">
          <h2 className="text-[17px] font-semibold">Log activity</h2>
          <LogLeadActivityForm leadId={lead.id} />
          <div className="flex flex-col">
            <h3 className="mb-1 text-[13px] font-semibold text-muted-foreground">Activity history ({lead.activities.length})</h3>
            {lead.activities.length === 0 && (
              <p className="py-3 text-sm text-muted-foreground">No calls, follow-ups or meetings logged yet.</p>
            )}
            <ol className="flex flex-col">
              {lead.activities.map((a) => (
                <li key={a.id} className="flex gap-3.5 border-b border-muted py-3.5 last:border-b-0">
                  <span className="w-[82px] shrink-0 pt-0.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    {LEAD_ACTIVITY_LABEL[a.type]}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    {a.note && <p className="text-sm leading-normal whitespace-pre-wrap">{a.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(a.createdAt)} · {a.user?.name ?? "Deleted user"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold">Follow-up tasks ({tasks.rows.length})</h2>
          <TaskFormDialog
            mode="create"
            projects={options.projects}
            members={options.members}
            defaultLeadId={lead.id}
            defaultProjectId={lead.project?.id}
          />
        </div>
        <div className="flex flex-col gap-2">
          {tasks.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No tasks yet — add one to track the next step with this lead.</p>
          )}
          {tasks.rows.map((t) => (
            <TaskRow
              key={t.id}
              task={{ ...t, lead: null }}
              comments={tasks.commentsFor(t.id)}
              history={tasks.historyFor(t.id)}
              projects={options.projects}
              members={options.members}
              currentUser={user}
              showAssignee
            />
          ))}
        </div>
      </section>
    </div>
  );
}
