import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";

import { SERIES, StackedColumnChart } from "@/components/charts/charts";
import { DailyLogDialog } from "@/components/daily-logs/daily-log-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { getActivityTrend, getOpenEvents, plainText } from "@/lib/daily-log-data";
import { db } from "@/lib/db";
import { istDayEnd, istDayStart, isValidDateString } from "@/lib/dates";
import { startOfToday } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/task-constants";
import type { TaskStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";

const FIELD = "h-11 min-w-0 rounded-[11px] border border-input bg-card px-3.5 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const COUNTERS = [
  { key: "callsMade", label: "calls" },
  { key: "followUps", label: "follow-ups" },
  { key: "meetings", label: "meetings" },
  { key: "dealsClosed", label: "deals" },
  { key: "outboundReach", label: "outbound" },
  { key: "discoveryDemos", label: "demos" },
  { key: "profilesSignups", label: "sign-ups" },
] as const;

export default async function DailyUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;

  // Admins can review anyone's updates ("team" = everyone); members only see their own.
  const member = isAdmin ? one(params.member) || "team" : user.id;
  const from = one(params.from);
  const to = one(params.to);

  const where: Prisma.DailyLogWhereInput = {
    ...(member === "team" ? {} : { userId: member }),
    ...(from || to
      ? {
          createdAt: {
            ...(isValidDateString(from) ? { gte: istDayStart(from) } : {}),
            ...(isValidDateString(to) ? { lt: istDayEnd(to) } : {}),
          },
        }
      : {}),
  };

  const showSalesChart = isAdmin || hasSalesAccess(user);
  const [logs, people, openTasks, trend, myLogsToday, openEvents] = await Promise.all([
    db.dailyLog.findMany({ where, include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    isAdmin ? db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    db.task.findMany({
      where: { assigneeId: user.id, status: { notIn: ["COMPLETED", "PENDING_APPROVAL"] } },
      select: { id: true, title: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    showSalesChart ? getActivityTrend(member === "team" ? null : [member], 30) : Promise.resolve([]),
    db.dailyLog.count({ where: { userId: user.id, createdAt: { gte: startOfToday() } } }),
    getOpenEvents(user.id),
  ]);

  const loggedToday = myLogsToday > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Daily updates</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Everyone's daily activity — no separate reports needed." : "Your submitted updates. They feed your KPIs automatically."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!loggedToday && <Badge variant="warning">Not submitted today</Badge>}
          <DailyLogDialog showSalesFields={hasSalesAccess(user)} openTasks={openTasks} openEvents={openEvents} />
        </div>
      </div>

      {isAdmin && (
        <form
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 sm:px-6"
          action="/daily-updates"
        >
          <label className="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold text-secondary-foreground">
            Team member
            <select name="member" defaultValue={member} className={FIELD}>
              <option value="team">Whole team</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-secondary-foreground">
            From
            <input type="date" name="from" defaultValue={from} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-secondary-foreground">
            To
            <input type="date" name="to" defaultValue={to} className={FIELD} />
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            {(from || to || member !== "team") && (
              <Button asChild variant="ghost">
                <Link href="/daily-updates">Clear</Link>
              </Button>
            )}
          </div>
        </form>
      )}

      {showSalesChart && (
        <Card className="p-6">
          <h2 className="text-[17px] font-semibold">Sales activity · last 30 days</h2>
          <StackedColumnChart
            data={trend}
            series={[
              { key: "calls", label: "Calls", color: SERIES[0] },
              { key: "followUps", label: "Follow-ups", color: SERIES[1] },
              { key: "meetings", label: "Meetings", color: SERIES[2] },
            ]}
          />
        </Card>
      )}

      <Card className="gap-1.5 p-6">
        <h2 className="mb-2 text-[17px] font-semibold">History</h2>
        {logs.length === 0 && <p className="py-3 text-sm text-muted-foreground">No updates in this range yet.</p>}
        <ol className="flex flex-col">
          {logs.map((log) => {
            const counters = COUNTERS.filter((c) => log[c.key] > 0);
            const tasks = (log.taskUpdates ?? []) as { taskId: string; title: string; status: TaskStatus }[];
            const notes = plainText(log.activitiesHtml);
            const events = (log.eventUpdates ?? []) as { eventId: string; name: string; change: "ATTENDED" | "CONDUCTED" }[];
            return (
              <li key={log.id} className="flex flex-col gap-1.5 border-b border-[#EFEDE6] py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold">
                    {isAdmin && member === "team" ? `${log.user.name} · ` : ""}
                    {formatDate(log.createdAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tasks.length > 0 && `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · `}
                    {formatDate(log.createdAt, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                {counters.length > 0 && (
                  <p className="text-[13px] text-secondary-foreground">
                    {counters.map((c, i) => (
                      <span key={c.key}>
                        {i > 0 && " · "}
                        <span className="font-mono font-medium">{log[c.key]}</span> {c.label}
                      </span>
                    ))}
                  </p>
                )}
                {tasks.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {tasks.map((t) => (
                      <li key={t.taskId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} />
                        <span className="text-muted-foreground">Worked on</span>
                        <span className="font-semibold">{t.title}</span>
                        <Badge variant={t.status === "COMPLETED" ? "success" : "default"}>{STATUS_LABEL[t.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                {events.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {events.map((e) => (
                      <li key={e.eventId} className="flex flex-wrap items-center gap-x-2">
                        <span className="text-muted-foreground">{e.change === "ATTENDED" ? "Attended" : "Conducted"}</span>
                        <span className="font-semibold">{e.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {notes && <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{notes}</p>}
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}
