import type { AccessLevel } from "@prisma/client";

import { ActivityList } from "@/components/activity/activity-list";
import { DonutChart } from "@/components/charts/charts";
import { DailyLogDialog } from "@/components/daily-logs/daily-log-dialog";
import {
  CardLink,
  DashboardHeader,
  ProjectProgressList,
  SectionCard,
  StatTile,
  UpcomingEvents,
  greeting,
  todayLabel,
} from "@/components/dashboard/dashboard-ui";
import { KpiHistoryCard } from "@/components/dashboard/kpi-history";
import { KpiPeriodTabs, KpiSection } from "@/components/dashboard/kpi-tiles";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskRow } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { hasSalesAccess, hasTaskAccess, isEngineering } from "@/lib/access";
import { getActivity, getVisibleActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { getOpenEvents } from "@/lib/daily-log-data";
import { getEventAlerts } from "@/lib/event-alerts";
import { standingLabels } from "@/lib/event-constants";
import { addDays, endOfDateOnly, startOfToday } from "@/lib/dates";
import { getKpiHistory, getUserKpis, kpiPeriodRange } from "@/lib/kpi";
import type { KpiPeriod } from "@/lib/kpi-constants";
import { LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { getProjectProgressMap } from "@/lib/project-progress";
import type { CurrentUser } from "@/lib/session";
import { loadTaskFormOptions, loadTaskRows } from "@/lib/task-data";
import { STATUS_COLOR, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-constants";
import { involvedProjectsWhere } from "@/lib/visibility";
import { formatDate } from "@/lib/format";

type Target = { id: string; name: string; role: string; access: AccessLevel; isFounder: boolean };


/**
 * One person's operational dashboard. Rendered for yourself, or for someone
 * else when an admin uses "View dashboard" (then `viewer` differs from
 * `target` and personal-only actions like the daily update are hidden).
 */
export async function PersonalDashboard({
  target,
  viewer,
  period,
  query,
}: {
  target: Target;
  viewer: CurrentUser;
  period: KpiPeriod;
  query: string;
}) {
  const isSelf = target.id === viewer.id;
  const sales = hasSalesAccess(target);
  const taskUser = hasTaskAccess(target) || !sales;
  const engineering = isEngineering(target);
  const today = startOfToday();
  const range = kpiPeriodRange(period);

  const [kpis, taskData, options, statusCounts, overdueCount, dueSoonCount, completedInPeriod, onTimeSource, projects, overviews, alerts, activity, leadStages, followUpsDue] =
    await Promise.all([
      getUserKpis(target, period),
      loadTaskRows(viewer, { assigneeId: target.id, status: { not: "COMPLETED" } }, undefined, 8),
      loadTaskFormOptions(viewer),
      db.task.groupBy({ by: ["status"], where: { assigneeId: target.id }, _count: { _all: true } }),
      db.task.count({ where: { assigneeId: target.id, status: { not: "COMPLETED" }, dueDate: { lt: today } } }),
      db.task.count({ where: { assigneeId: target.id, status: { not: "COMPLETED" }, dueDate: { gte: today, lt: addDays(today, 7) } } }),
      db.task.count({ where: { assigneeId: target.id, status: "COMPLETED", completedAt: { gte: range.start, lt: range.end } } }),
      db.task.findMany({
        where: { assigneeId: target.id, status: "COMPLETED", dueDate: { not: null }, completedAt: { gte: addDays(today, -90) } },
        select: { dueDate: true, completedAt: true },
      }),
      db.project.findMany({
        where: { AND: [involvedProjectsWhere(target.id), { overallStatus: { not: "COMPLETED" } }] },
        select: { id: true, name: true, dueDate: true },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      db.eventOverview.findMany({
        where: { userId: target.id },
        include: { event: { select: { name: true, date: true, city: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      getEventAlerts(target.id, 14),
      // Admin viewing someone: that person's own actions. Yourself: everything around your work.
      isSelf ? getVisibleActivity(viewer, { limit: 10 }) : getActivity({ actorIds: [target.id], limit: 10 }),
      sales ? db.lead.groupBy({ by: ["stage"], where: { ownerId: target.id }, _count: { _all: true } }) : Promise.resolve([]),
      sales
        ? db.lead.count({ where: { ownerId: target.id, stage: { notIn: ["WON", "LOST"] }, nextFollowUp: { lt: addDays(today, 1) } } })
        : Promise.resolve(0),
    ]);

  const [progress, history] = await Promise.all([
    getProjectProgressMap(projects.map((p) => p.id)),
    getKpiHistory([target], 6).then((h) => h.get(target.id) ?? []),
  ]);
  const onTimeRate = onTimeSource.length
    ? Math.round(
        (onTimeSource.filter((t) => t.completedAt! < endOfDateOnly(t.dueDate!)).length /
          onTimeSource.length) *
          100
      )
    : null;
  const openCount = statusCounts.filter((s) => s.status !== "COMPLETED").reduce((sum, s) => sum + s._count._all, 0);

  const openEvents = isSelf ? await getOpenEvents(target.id) : [];
  const openTasks = isSelf
    ? await db.task.findMany({
        where: { assigneeId: target.id, status: { notIn: ["COMPLETED", "PENDING_APPROVAL"] } },
        select: { id: true, title: true, status: true },
        orderBy: { updatedAt: "desc" },
        take: 30,
      })
    : [];

  // Tiles deep-link into /tasks; for an admin viewing someone else, scoped to that person.
  const tasksHref = (qs: string) => {
    const params = [qs, isSelf ? "" : `assignee=${target.id}`].filter(Boolean).join("&");
    return `/tasks${params ? `?${params}` : ""}`;
  };
  const heading = engineering ? "Engineering dashboard" : sales && !hasTaskAccess(target) ? "Sales dashboard" : "Dashboard";
  const pipeline = LEAD_STAGES.map((s) => ({
    stage: s,
    label: LEAD_STAGE_LABEL[s],
    count: leadStages.find((l) => l.stage === s)?._count._all ?? 0,
  }));
  const pipelineMax = Math.max(1, ...pipeline.map((p) => p.count));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        eyebrow={isSelf ? `${todayLabel()} · ${heading}` : `${target.role} · viewing as admin`}
        title={isSelf ? greeting(target.name) : `${target.name}'s dashboard`}
        actions={
          <>
            <KpiPeriodTabs current={period} query={query} />
            {isSelf && (
              <>
                <DailyLogDialog showSalesFields={sales} openTasks={openTasks} openEvents={openEvents} />
                <TaskFormDialog mode="create" projects={options.projects} members={options.members} />
              </>
            )}
          </>
        }
      />

      <KpiSection kpis={kpis} period={period} query={query} title={sales ? "Sales KPIs" : "Performance"} />

      {taskUser && (
        <section aria-label="Task totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile compact label="Open tasks" value={openCount} href={tasksHref("")} />
          <StatTile compact label="Overdue" value={overdueCount} href={tasksHref("due=overdue")} warning={overdueCount > 0} />
          <StatTile compact label="Due in 7 days" value={dueSoonCount} href={tasksHref("due=week")} />
          {engineering || onTimeRate !== null ? (
            <StatTile
              compact
              label="On-time delivery (90d)"
              value={onTimeRate === null ? "—" : `${onTimeRate}%`}
              href={tasksHref("status=COMPLETED")}
            />
          ) : (
            <StatTile compact label="Completed" value={completedInPeriod} href={tasksHref("status=COMPLETED")} />
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SectionCard
          className="lg:col-span-8"
          title={isSelf ? "My open tasks" : "Open tasks"}
          action={isSelf ? <CardLink href="/tasks">See all</CardLink> : undefined}
          bodyClassName="gap-2"
        >
          {taskData.rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing open — nice.</p>}
          {taskData.rows.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              comments={taskData.commentsFor(t.id)}
              history={taskData.historyFor(t.id)}
              projects={options.projects}
              members={options.members}
              currentUser={viewer}
            />
          ))}
        </SectionCard>

        <SectionCard className="lg:col-span-4" title="Tasks by status">
          <DonutChart
            centerLabel="tasks"
            height={150}
            data={TASK_STATUSES.map((s) => ({
              label: STATUS_LABEL[s],
              value: statusCounts.find((c) => c.status === s)?._count._all ?? 0,
              color: STATUS_COLOR[s],
            }))}
          />
        </SectionCard>
      </div>

      {sales && (
        <SectionCard
          title={isSelf ? "My pipeline" : "Lead pipeline"}
          action={
            <span className="flex items-center gap-3">
              {followUpsDue > 0 && (
                <Badge variant="warning">
                  {followUpsDue} follow-up{followUpsDue === 1 ? "" : "s"} due
                </Badge>
              )}
              {isSelf && <CardLink href="/leads">Open leads</CardLink>}
            </span>
          }
          bodyClassName="gap-3"
        >
          {pipeline.every((p) => p.count === 0) ? (
            <p className="text-sm text-muted-foreground">No leads yet.</p>
          ) : (
            pipeline.map((p) => (
              <div key={p.stage} className="grid grid-cols-[88px_minmax(0,1fr)_40px] items-center gap-3.5 sm:grid-cols-[110px_minmax(0,1fr)_48px]">
                <span className="truncate text-[13px] font-medium text-secondary-foreground">{p.label}</span>
                <div className="h-[22px] rounded-r bg-background">
                  <div className="h-full rounded-r bg-primary" style={{ width: `${(p.count / pipelineMax) * 100}%` }} />
                </div>
                <span className="text-right font-mono text-sm tabular-nums">{p.count}</span>
              </div>
            ))
          )}
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SectionCard title={isSelf ? "My projects" : "Active projects"}>
          <ProjectProgressList
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              percent: progress.get(p.id)!.percent,
              meta: p.dueDate ? `Due ${formatDate(p.dueDate)}` : null,
            }))}
          />
        </SectionCard>

        <SectionCard title={isSelf ? "My events" : "Events"} action={<CardLink href="/discovery">All events</CardLink>} bodyClassName="gap-4">
          <UpcomingEvents alerts={alerts} limit={4} />
          {overviews.length > 0 && (
            <div className="flex flex-col border-t border-border pt-3">
              <p className="pb-1 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Event overview</p>
              {overviews.map((eo) => (
                <div key={eo.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-muted last:border-0">
                  <span className="truncate text-sm font-semibold">{eo.event.name}</span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {standingLabels(eo).map((label) => (
                      <Badge key={label} variant={label === "Attended" || label === "Conducted" ? "success" : "default"}>
                        {label}
                      </Badge>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent activity"
          className="md:col-span-2 xl:col-span-1"
          action={<CardLink href="/activity">View all</CardLink>}
        >
          <ActivityList items={activity} compact />
        </SectionCard>
      </div>

      <KpiHistoryCard history={history} />
    </div>
  );
}

