import Link from "next/link";
import { AlertTriangle, LayoutDashboard } from "lucide-react";

import { ActivityList } from "@/components/activity/activity-list";
import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { DonutChart, HorizontalBarChart } from "@/components/charts/charts";
import {
  CardLink,
  DashboardHeader,
  ProjectProgressList,
  ScoreBar,
  SectionCard,
  StatTile,
  UpcomingEvents,
  greeting,
  todayLabel,
} from "@/components/dashboard/dashboard-ui";
import { KpiPeriodTabs } from "@/components/dashboard/kpi-tiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getActivity } from "@/lib/activity";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { loadApprovals } from "@/lib/approval-data";
import { db } from "@/lib/db";
import { getEventAlerts } from "@/lib/event-alerts";
import { addDays, startOfToday } from "@/lib/events";
import { getKpisForUsers, kpiPeriodRange, weightedScore } from "@/lib/kpi";
import { KPI_PERIOD_LABEL, kpisForAccess, type KpiPeriod } from "@/lib/kpi-constants";
import { getProjectProgressMap } from "@/lib/project-progress";
import type { CurrentUser } from "@/lib/session";
import { STATUS_COLOR, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-constants";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

/** Organisation-wide executive overview for founders / admins. */
export async function AdminOverview({ viewer, period, showMyDashboardLink }: {
  viewer: CurrentUser;
  period: KpiPeriod;
  showMyDashboardLink: boolean;
}) {
  const today = startOfToday();
  const weekAhead = addDays(today, 7);
  const range = kpiPeriodRange(period);

  const [members, statusCounts, perMember, completedInPeriod, deadlines, activeProjects, approvals, alerts, activity] =
    await Promise.all([
      db.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true, access: true, isFounder: true },
        orderBy: { name: "asc" },
      }),
      db.task.groupBy({ by: ["status"], _count: { _all: true } }),
      db.task.groupBy({
        by: ["assigneeId", "status"],
        where: { status: { not: "COMPLETED" } },
        _count: { _all: true },
      }),
      db.task.groupBy({
        by: ["assigneeId"],
        where: { status: "COMPLETED", completedAt: { gte: range.start, lt: range.end } },
        _count: { _all: true },
      }),
      db.task.findMany({
        where: { status: { not: "COMPLETED" }, dueDate: { lt: weekAhead } },
        include: { assignee: { select: { name: true } }, project: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 12,
      }),
      db.project.findMany({
        where: { overallStatus: { in: ["IN_PROGRESS", "NOT_STARTED"] } },
        select: { id: true, name: true, dueDate: true },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      loadApprovals({ status: { in: ["REQUEST_RAISED", "DISCUSS"] } }, 3),
      getEventAlerts(viewer.id, 14),
      getActivity({ limit: 15 }),
    ]);

  const [kpisByUser, overdueByUser, progress, pendingApprovalCount] = await Promise.all([
    getKpisForUsers(members, period),
    db.task.groupBy({
      by: ["assigneeId"],
      where: { status: { not: "COMPLETED" }, dueDate: { lt: today } },
      _count: { _all: true },
    }),
    getProjectProgressMap(activeProjects.map((p) => p.id)),
    db.approval.count({ where: { status: { in: ["REQUEST_RAISED", "DISCUSS"] } } }),
  ]);
  // The tile counts every in-progress project; the chart below shows the 8 most recent open ones.
  const activeProjectCount = await db.project.count({ where: { overallStatus: "IN_PROGRESS" } });

  const totalTasks = statusCounts.reduce((s, c) => s + c._count._all, 0);
  const openTasks = statusCounts.filter((c) => c.status !== "COMPLETED").reduce((s, c) => s + c._count._all, 0);
  const overdueTotal = overdueByUser.reduce((s, c) => s + c._count._all, 0);

  const cards = members.map((m) => {
    const open = perMember.filter((p) => p.assigneeId === m.id).reduce((s, p) => s + p._count._all, 0);
    return {
      ...m,
      open,
      overdue: overdueByUser.find((o) => o.assigneeId === m.id)?._count._all ?? 0,
      completed: completedInPeriod.find((c) => c.assigneeId === m.id)?._count._all ?? 0,
      score: kpisForAccess(m.access).length ? weightedScore(kpisByUser.get(m.id) ?? []) : null,
    };
  });
  const scored = cards.filter((c) => c.score !== null).sort((a, b) => b.score! - a.score!);
  const teamScore = scored.length ? Math.round(scored.reduce((s, c) => s + c.score!, 0) / scored.length) : null;
  const completedTotal = completedInPeriod.reduce((s, c) => s + c._count._all, 0);
  // Scored members first (best score on top), then everyone without KPI targets.
  const teamRows = [...scored, ...cards.filter((c) => c.score === null)];
  const periodLabel = KPI_PERIOD_LABEL[period].toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={`${todayLabel()} · Team overview`}
        title={greeting(viewer.name)}
        actions={
          <>
            <KpiPeriodTabs current={period} />
            {showMyDashboardLink && (
              <Button asChild size="lg" variant="outline">
                <Link href={`/?view=me&period=${period}`}>
                  <LayoutDashboard /> My dashboard
                </Link>
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Workspace totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Open tasks" value={openTasks} meta={`of ${totalTasks} total`} href="/tasks" />
        <StatTile
          label={`Completed ${periodLabel}`}
          value={completedTotal}
          meta={totalTasks > 0 ? `${Math.round(((totalTasks - openTasks) / totalTasks) * 100)}% of all tasks done` : undefined}
          href="/tasks?status=COMPLETED"
        />
        <StatTile label="Active projects" value={activeProjectCount} meta="In progress" href="/projects?status=IN_PROGRESS" />
        <StatTile
          label="Overdue"
          value={overdueTotal}
          meta={overdueTotal ? "Review overdue tasks →" : "Nothing overdue"}
          href="/tasks?due=overdue"
          warning={overdueTotal > 0}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SectionCard
          className="lg:col-span-7"
          title="Team performance"
          action={
            <span className="text-[13px] text-muted-foreground">
              Weighted KPI score · {periodLabel}
              {teamScore !== null && (
                <>
                  {" · "}
                  <Link href="/reports" className="font-semibold text-foreground hover:text-primary">
                    team avg {teamScore}%
                  </Link>
                </>
              )}
            </span>
          }
          bodyClassName="gap-4"
        >
          {scored.length === 0 && (
            <p className="text-sm text-muted-foreground">Set KPI targets on the Team page to see performance scores.</p>
          )}
          <ul className="flex flex-col">
            {teamRows.map((m) => (
              <li key={m.id} className="border-b border-muted last:border-0">
                <Link
                  href={`/?viewAs=${m.id}&period=${period}`}
                  title="View dashboard"
                  className="group grid min-h-[52px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 py-2 sm:grid-cols-[36px_minmax(0,170px)_minmax(0,1fr)_52px_minmax(96px,auto)]"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-secondary-foreground">
                    {initials(m.name)}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold group-hover:text-primary">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {m.role} · {ACCESS_LABEL[m.access]}
                    </span>
                  </span>
                  <span className="hidden sm:block">
                    {m.score !== null ? (
                      <ScoreBar value={m.score} className="h-2" />
                    ) : (
                      <span className="block h-2 rounded-full bg-muted" />
                    )}
                  </span>
                  <span className="text-right font-mono text-[15px] font-medium tabular-nums">
                    {m.score === null ? "—" : m.score}
                  </span>
                  <span className="col-span-2 col-start-2 text-xs text-muted-foreground sm:col-span-1 sm:col-start-auto sm:text-right">
                    {m.completed} done · {m.open} open
                    {m.overdue > 0 && <span className="font-semibold text-destructive"> · {m.overdue} overdue</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <CardLink href="/team">Open team · {members.length} members →</CardLink>
        </SectionCard>

        <SectionCard
          className="lg:col-span-5"
          title="Needs your approval"
          action={
            <Link href="/approvals">
              <Badge variant="primary">{pendingApprovalCount} waiting</Badge>
            </Link>
          }
          bodyClassName="gap-3"
        >
          <ApprovalQueue approvals={approvals} />
          {pendingApprovalCount > approvals.length && (
            <CardLink href="/approvals">All approvals ({pendingApprovalCount}) →</CardLink>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title="Coming up" action={<CardLink href="/discovery">All events</CardLink>}>
          <UpcomingEvents alerts={alerts} limit={6} />
        </SectionCard>

        <SectionCard title="Projects" action={<CardLink href="/projects">View all</CardLink>}>
          <ProjectProgressList
            projects={activeProjects.map((p) => ({
              id: p.id,
              name: p.name,
              percent: progress.get(p.id)?.percent ?? 0,
              meta: p.dueDate ? `Due ${formatDate(p.dueDate)}` : null,
            }))}
          />
        </SectionCard>

        <SectionCard
          title="Activity"
          className="md:col-span-2 xl:col-span-1"
          action={
            <span className="flex gap-3">
              <CardLink href="/activity?kind=discussions">Discussions</CardLink>
              <CardLink href="/activity">View all</CardLink>
            </span>
          }
        >
          <ActivityList items={activity} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SectionCard className="lg:col-span-7" title="Overdue & upcoming work">
          {deadlines.length === 0 && <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>}
          <ul className="flex flex-col">
            {deadlines.map((t) => {
              const overdue = t.dueDate! < today;
              return (
                <li key={t.id} className="border-b border-muted last:border-0">
                  <Link
                    href={t.projectId ? `/projects/${t.projectId}` : `/tasks?assignee=${t.assigneeId}`}
                    className="group flex min-h-[52px] items-center gap-3 py-2"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: overdue ? "var(--destructive)" : STATUS_COLOR[t.status] }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-semibold group-hover:text-primary">{t.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {STATUS_LABEL[t.status]} · {t.assignee.name}
                        {t.project ? ` · ${t.project.name}` : ""}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 text-[13px]",
                        overdue ? "font-semibold text-destructive" : "font-medium text-secondary-foreground"
                      )}
                    >
                      {overdue && <AlertTriangle className="size-3.5" />}
                      {overdue ? "Overdue " : ""}
                      {formatDate(t.dueDate!)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard className="lg:col-span-5" title="All tasks by status" bodyClassName="gap-3">
          <DonutChart
            centerLabel="tasks"
            height={150}
            data={TASK_STATUSES.map((s) => ({
              label: STATUS_LABEL[s],
              value: statusCounts.find((c) => c.status === s)?._count._all ?? 0,
              color: STATUS_COLOR[s],
            }))}
          />
          {totalTasks > 0 && (
            <p className="text-xs text-muted-foreground">
              {Math.round(((totalTasks - openTasks) / totalTasks) * 100)}% of all tasks completed.
            </p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Tasks completed by member"
        action={<span className="text-[13px] text-muted-foreground">{KPI_PERIOD_LABEL[period]}</span>}
      >
        <HorizontalBarChart
          valueName="Completed"
          data={cards
            .filter((c) => c.completed > 0 || c.open > 0)
            .sort((a, b) => b.completed - a.completed)
            .slice(0, 12)
            .map((c) => ({ label: c.name, value: c.completed }))}
        />
      </SectionCard>
    </div>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

