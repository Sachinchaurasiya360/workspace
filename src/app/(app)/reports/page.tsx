import Link from "next/link";
import { Download } from "lucide-react";
import { redirect } from "next/navigation";

import { ColumnChart, DonutChart, HorizontalBarChart, SERIES, StackedColumnChart } from "@/components/charts/charts";
import { KpiPeriodTabs } from "@/components/dashboard/kpi-tiles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { canManageAll } from "@/lib/access";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { APPROVAL_STATUS_LABEL } from "@/lib/approval-constants";
import { getActivityTrend } from "@/lib/daily-log-data";
import { db } from "@/lib/db";
import { startOfToday } from "@/lib/events";
import { getKpiHistory, kpiPeriodRange } from "@/lib/kpi";
import { getTeamPerformance } from "@/lib/report-data";
import { KPI_PERIOD_LABEL, kpisForAccess, parseKpiPeriod } from "@/lib/kpi-constants";
import { PROJECT_STATUS_LABEL } from "@/lib/project-constants";
import { getProjectProgressMap } from "@/lib/project-progress";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

const TH = "px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap";
const TD = "px-3 py-2.5 font-mono text-sm whitespace-nowrap tabular-nums";
const TR = "border-b border-[#EFEDE6] last:border-0";
const LOW_PROGRESS = "[&>[data-slot=progress-indicator]]:bg-warning";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !canManageAll(user)) redirect("/");
  const period = parseKpiPeriod((await searchParams).period);
  const range = kpiPeriodRange(period);
  const inPeriod = { gte: range.start, lt: range.end };
  const today = startOfToday();

  const [{ members, rows }, projects, approvals, trend] = await Promise.all([
    getTeamPerformance(period),
    db.project.findMany({
      include: { lead: { select: { name: true } } },
      orderBy: [{ overallStatus: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    }),
    db.approval.findMany({
      where: { createdAt: inPeriod },
      select: { status: true, type: true, createdAt: true, resolvedAt: true },
    }),
    getActivityTrend(null, 30),
  ]);
  const measured = members.filter((m) => kpisForAccess(m.access).length > 0);
  const [progress, history] = await Promise.all([
    getProjectProgressMap(projects.map((p) => p.id)),
    getKpiHistory(measured, 6),
  ]);
  const historyMonths = history.values().next().value ?? [];
  const teamTrend = historyMonths.map((m, i) => {
    const scores = measured.map((u) => history.get(u.id)?.[i]?.score).filter((v): v is number => v !== null && v !== undefined);
    return { label: m.label, value: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null };
  });

  const resolved = approvals.filter((a) => a.resolvedAt);
  const avgTurnaroundHours = resolved.length
    ? Math.round(resolved.reduce((s, a) => s + (a.resolvedAt!.getTime() - a.createdAt.getTime()), 0) / resolved.length / 3_600_000)
    : null;
  const activeProjects = projects.filter((p) => p.overallStatus !== "COMPLETED");
  const label = KPI_PERIOD_LABEL[period].toLowerCase();
  const rangeLabel = `${formatDate(range.start)} – ${formatDate(new Date(range.end.getTime() - 1))}`;
  const totals = rows.reduce(
    (t, r) => ({
      completed: t.completed + r.completed,
      attended: t.attended + r.attended,
      conducted: t.conducted + r.conducted,
      updates: t.updates + r.updates,
    }),
    { completed: 0, attended: 0, conducted: 0, updates: 0 }
  );
  const scored = rows.filter((r) => r.score !== null).sort((a, b) => b.score! - a.score!);
  const latestTeamScore = [...teamTrend].reverse().find((m) => m.value !== null)?.value ?? null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {KPI_PERIOD_LABEL[period]} · {rangeLabel}
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Reports</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2.5">
          <KpiPeriodTabs current={period} basePath="/reports" />
          <Button asChild variant="outline" className="h-11">
            <a href={`/reports/export?period=${period}`} download>
              <Download /> Team CSV
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11">
            <a href={`/reports/export?period=${period}&type=tasks`} download>
              <Download /> Tasks CSV
            </a>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {measured.length > 0 && (
          <Figure
            className="lg:col-span-7"
            title="Performance over time"
            meta={latestTeamScore === null ? "Last 6 months" : `Team average ${latestTeamScore}% · last 6 months`}
          >
            <ColumnChart
              valueName="Team average score"
              unit="%"
              max={100}
              height={220}
              emptyMessage="No KPI targets in these months yet."
              data={teamTrend}
            />
          </Figure>
        )}
        <Figure
          className={measured.length > 0 ? "lg:col-span-5" : "lg:col-span-12"}
          title="KPI attainment by person"
          footnote={`Weighted score against each person’s targets for ${label}.`}
        >
          <HorizontalBarChart
            valueName="Score"
            unit="%"
            max={100}
            reference={100}
            data={scored.map((r) => ({ label: r.name, value: r.score! }))}
          />
        </Figure>
      </section>

      <Figure title="Team performance" meta={`${rows.length} member${rows.length === 1 ? "" : "s"}`}>
        <div className="-mx-6 overflow-x-auto px-6">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>Member</th>
                <th className={TH}>Score</th>
                <th className={TH}>KPI achievement</th>
                <th className={cn(TH, "text-right")}>Tasks done</th>
                <th className={cn(TH, "text-right")}>On time</th>
                <th className={cn(TH, "text-right")}>Overdue</th>
                <th className={cn(TH, "text-right")}>Updates</th>
                <th className={cn(TH, "text-right")}>Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={TR}>
                  <td className="px-3 py-3">
                    <Link href={`/?viewAs=${r.id}&period=${period}`} className="text-sm font-semibold text-foreground hover:text-primary">
                      {r.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{ACCESS_LABEL[r.access]}</p>
                  </td>
                  <td className={TD}>
                    {r.score === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Progress value={r.score} className={cn("w-16", r.score < 50 && LOW_PROGRESS)} />
                        {r.score}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {r.kpis.length === 0 && <span className="text-xs text-muted-foreground">No targets</span>}
                      {r.kpis.map((k) => (
                        <Badge key={k.kpi} variant={k.actual >= k.target! ? "success" : "outline"} title={`${k.actual} of ${k.target}`}>
                          {k.label} {k.actual}/{k.target}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className={cn(TD, "text-right")}>{r.completed}</td>
                  <td className={cn(TD, "text-right")}>{r.onTime === null ? "—" : `${r.onTime}%`}</td>
                  <td className={cn(TD, "text-right", r.overdue > 0 && "text-destructive")}>{r.overdue}</td>
                  <td className={cn(TD, "text-right")}>{r.updates}</td>
                  <td className={cn(TD, "text-right")} title="Attended / conducted">
                    {r.attended} / {r.conducted}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Figure>

      {measured.length > 0 && (
        <Figure title="Score history" meta="Last 6 months">
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="border-b border-border">
                <tr>
                  <th className={TH}>Member</th>
                  {historyMonths.map((m) => (
                    <th key={m.month} className={cn(TH, "text-right")}>
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {measured.map((u) => (
                  <tr key={u.id} className={TR}>
                    <td className="px-3 py-2.5 text-sm font-medium">{u.name}</td>
                    {(history.get(u.id) ?? []).map((m) => (
                      <td key={m.month} className={cn(TD, "text-right")}>
                        {m.score === null ? <span className="text-muted-foreground">—</span> : `${m.score}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Figure>
      )}

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Figure
          className="lg:col-span-7"
          title="Project progress"
          meta={`${activeProjects.length} active · ${projects.length - activeProjects.length} completed`}
        >
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[560px] border-collapse">
              <thead className="border-b border-border">
                <tr>
                  <th className={TH}>Project</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Progress</th>
                  <th className={cn(TH, "text-right")}>Due</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const pr = progress.get(p.id)!;
                  const late = p.dueDate && p.overallStatus !== "COMPLETED" && p.dueDate < today;
                  return (
                    <tr key={p.id} className={TR}>
                      <td className="px-3 py-3">
                        <Link href={`/projects/${p.id}`} className="text-sm font-semibold text-foreground hover:text-primary">
                          {p.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.lead?.name ?? "No lead"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={p.overallStatus === "COMPLETED" ? "success" : "default"}>
                          {PROJECT_STATUS_LABEL[p.overallStatus]}
                        </Badge>
                      </td>
                      <td className={TD}>
                        <span className="flex items-center gap-2">
                          <Progress value={pr.percent} className={cn("w-20", pr.percent < 50 && LOW_PROGRESS)} />
                          {pr.percent}%{" "}
                          <span className="font-sans text-xs text-muted-foreground">
                            ({pr.completed}/{pr.total})
                          </span>
                        </span>
                      </td>
                      <td className={cn(TD, "text-right", late && "text-destructive")}>
                        {p.dueDate ? formatDate(p.dueDate) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Figure>

        <Figure className="lg:col-span-5" title="Approvals" meta={KPI_PERIOD_LABEL[period]}>
          <DonutChart
            height={130}
            centerLabel="requests"
            data={(["REQUEST_RAISED", "DISCUSS", "APPROVED", "REJECTED", "CANCELLED"] as const).map((s, i) => ({
              label: APPROVAL_STATUS_LABEL[s],
              value: approvals.filter((a) => a.status === s).length,
              color: SERIES[i]!,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            {approvals.filter((a) => a.type === "EVENT_ATTENDANCE").length} event ·{" "}
            {approvals.filter((a) => a.type === "TASK_COMPLETION").length} task requests
            {avgTurnaroundHours !== null ? ` · avg decision in ${avgTurnaroundHours < 48 ? `${avgTurnaroundHours}h` : `${Math.round(avgTurnaroundHours / 24)}d`}` : ""}
          </p>
        </Figure>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Figure className="lg:col-span-7" title="Team sales activity" meta="Last 30 days">
          <StackedColumnChart
            data={trend}
            series={[
              { key: "calls", label: "Calls", color: SERIES[0] },
              { key: "followUps", label: "Follow-ups", color: SERIES[1] },
              { key: "meetings", label: "Meetings", color: SERIES[2] },
            ]}
          />
        </Figure>
        <Figure className="lg:col-span-5" title="Event participation" meta={KPI_PERIOD_LABEL[period]}>
          <StackedColumnChart
            height={200}
            data={rows
              .filter((r) => r.attended + r.conducted + r.registered > 0)
              .map((r) => ({ label: r.name.split(" ")[0]!, registered: r.registered, attended: r.attended, conducted: r.conducted }))}
            series={[
              { key: "registered", label: "Registered", color: SERIES[0] },
              { key: "attended", label: "Attended", color: SERIES[1] },
              { key: "conducted", label: "Conducted", color: SERIES[2] },
            ]}
          />
        </Figure>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Tasks completed" value={totals.completed} />
        <StatTile label="Events attended" value={totals.attended} />
        <StatTile label="Events conducted" value={totals.conducted} />
        <StatTile label="Daily updates logged" value={totals.updates} />
      </section>
    </div>
  );
}

function Figure({
  title,
  meta,
  footnote,
  className,
  children,
}: {
  title: string;
  meta?: string;
  footnote?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn("m-0 flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-6", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[17px] font-semibold">{title}</span>
        {meta && <span className="text-[13px] text-muted-foreground">{meta}</span>}
      </figcaption>
      {children}
      {footnote && <span className="text-xs text-muted-foreground">{footnote}</span>}
    </figure>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[30px] font-medium tracking-tight">{value}</span>
    </div>
  );
}
