import { addDays, istMidnight, istParts, startOfDayIST } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  KPI_LABEL,
  currentPeriod,
  kpisForAccess,
  monthKey,
  type KpiPeriod,
} from "@/lib/kpi-constants";
import type { AccessLevel, KpiMetric } from "@prisma/client";

export { KPI_LABEL, currentPeriod };

export type DateRange = { start: Date; end: Date };

/** [start, end) of the period containing `now`, on the IST calendar. Weeks start on Monday. */
export function kpiPeriodRange(period: KpiPeriod, now = new Date()): DateRange {
  const { year: y, month: m, weekday } = istParts(now);
  switch (period) {
    case "today": {
      const start = startOfDayIST(now);
      return { start, end: addDays(start, 1) };
    }
    case "week": {
      const start = addDays(startOfDayIST(now), -((weekday + 6) % 7));
      return { start, end: addDays(start, 7) };
    }
    case "month":
      return { start: istMidnight(y, m, 1), end: istMidnight(y, m + 1, 1) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { start: istMidnight(y, q, 1), end: istMidnight(y, q + 3, 1) };
    }
    case "year":
      return { start: istMidnight(y, 0, 1), end: istMidnight(y + 1, 0, 1) };
  }
}

/** Month keys covering the period (today/week use only the current month). */
function targetMonths(period: KpiPeriod, range: DateRange, now = new Date()) {
  if (period === "today" || period === "week") return [monthKey(now)];
  const keys: string[] = [];
  const { year, month } = istParts(range.start);
  for (let i = 0; istMidnight(year, month + i, 1) < range.end; i++) {
    keys.push(monthKey(istMidnight(year, month + i, 1)));
  }
  return keys;
}

/** Today and week pro-rate the month's target by day count; longer periods use the summed months. */
function scaleTarget(period: KpiPeriod, monthlyTotal: number, now = new Date()) {
  if (period === "today" || period === "week") {
    const { year, month } = istParts(now);
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const days = period === "today" ? 1 : 7;
    return Math.max(1, Math.round((monthlyTotal * days) / daysInMonth));
  }
  return monthlyTotal;
}

type TargetRow = { userId: string; kpi: KpiMetric; period: string; target: number; weight: number | null };

/**
 * The target that applies to a month: the one set for that month, or else the
 * most recent earlier one — so targets carry forward until an admin changes
 * them instead of vanishing on the 1st.
 */
function targetFor(rows: TargetRow[], month: string) {
  let best: TargetRow | undefined;
  for (const r of rows) {
    if (r.period > month) continue;
    if (!best || r.period > best.period) best = r;
  }
  return best;
}

export type KpiRow = {
  kpi: KpiMetric;
  label: string;
  actual: number;
  target: number | null;
  weight: number;
};

type Actuals = Record<KpiMetric, number>;

function emptyActuals(): Actuals {
  return {
    CALLS: 0,
    FOLLOW_UPS: 0,
    MEETINGS: 0,
    DEALS_CLOSED: 0,
    DISCOVERY: 0,
    PROFILES: 0,
    EVENTS_ATTENDED: 0,
    EVENTS_CONDUCTED: 0,
    TASKS_COMPLETED: 0,
  };
}

async function computeActuals(userIds: string[], range: DateRange) {
  const created = { gte: range.start, lt: range.end };
  const [logs, [attended, conducted], tasks] = await Promise.all([
    db.dailyLog.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, createdAt: created },
      _sum: {
        callsMade: true,
        followUps: true,
        meetings: true,
        dealsClosed: true,
        discoveryDemos: true,
        profilesSignups: true,
      },
    }),
    Promise.all([
      db.eventOverview.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, participation: "ATTENDED", attendedAt: created },
        _count: { _all: true },
      }),
      db.eventOverview.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, execution: "CONDUCTED", conductedAt: created },
        _count: { _all: true },
      }),
    ]),
    db.task.groupBy({
      by: ["assigneeId"],
      where: { assigneeId: { in: userIds }, status: "COMPLETED", completedAt: created },
      _count: { _all: true },
    }),
  ]);

  const result = new Map<string, Actuals>();
  for (const id of userIds) {
    const log = logs.find((l) => l.userId === id)?._sum;
    result.set(id, {
      CALLS: log?.callsMade ?? 0,
      FOLLOW_UPS: log?.followUps ?? 0,
      MEETINGS: log?.meetings ?? 0,
      DEALS_CLOSED: log?.dealsClosed ?? 0,
      DISCOVERY: log?.discoveryDemos ?? 0,
      PROFILES: log?.profilesSignups ?? 0,
      EVENTS_ATTENDED: attended.find((e) => e.userId === id)?._count._all ?? 0,
      EVENTS_CONDUCTED: conducted.find((e) => e.userId === id)?._count._all ?? 0,
      TASKS_COMPLETED: tasks.find((t) => t.assigneeId === id)?._count._all ?? 0,
    });
  }
  return result;
}

/**
 * Actuals for several consecutive ranges from one set of queries: the rows
 * for the whole span are fetched once and bucketed here, instead of one
 * round of aggregates per range.
 */
async function computeActualsPerRange(userIds: string[], ranges: DateRange[]) {
  const span = { gte: ranges[0]!.start, lt: ranges[ranges.length - 1]!.end };
  const [logs, attended, conducted, tasks] = await Promise.all([
    db.dailyLog.findMany({
      where: { userId: { in: userIds }, createdAt: span },
      select: {
        userId: true,
        createdAt: true,
        callsMade: true,
        followUps: true,
        meetings: true,
        dealsClosed: true,
        discoveryDemos: true,
        profilesSignups: true,
      },
    }),
    db.eventOverview.findMany({
      where: { userId: { in: userIds }, participation: "ATTENDED", attendedAt: span },
      select: { userId: true, attendedAt: true },
    }),
    db.eventOverview.findMany({
      where: { userId: { in: userIds }, execution: "CONDUCTED", conductedAt: span },
      select: { userId: true, conductedAt: true },
    }),
    db.task.findMany({
      where: { assigneeId: { in: userIds }, status: "COMPLETED", completedAt: span },
      select: { assigneeId: true, completedAt: true },
    }),
  ]);

  const buckets = ranges.map(() => new Map(userIds.map((id) => [id, emptyActuals()])));
  const slot = (userId: string, at: Date | null) => {
    if (!at) return undefined;
    const i = ranges.findIndex((r) => at >= r.start && at < r.end);
    return i < 0 ? undefined : buckets[i]!.get(userId);
  };

  for (const l of logs) {
    const a = slot(l.userId, l.createdAt);
    if (!a) continue;
    a.CALLS += l.callsMade;
    a.FOLLOW_UPS += l.followUps;
    a.MEETINGS += l.meetings;
    a.DEALS_CLOSED += l.dealsClosed;
    a.DISCOVERY += l.discoveryDemos;
    a.PROFILES += l.profilesSignups;
  }
  for (const e of attended) {
    const a = slot(e.userId, e.attendedAt);
    if (a) a.EVENTS_ATTENDED++;
  }
  for (const e of conducted) {
    const a = slot(e.userId, e.conductedAt);
    if (a) a.EVENTS_CONDUCTED++;
  }
  for (const t of tasks) {
    const a = slot(t.assigneeId, t.completedAt);
    if (a) a.TASKS_COMPLETED++;
  }
  return buckets;
}

type KpiUser = { id: string; access: AccessLevel };

/** Everything up to `lastMonth`, so earlier targets can carry forward. */
function loadTargets(userIds: string[], lastMonth: string) {
  return db.kpiTarget.findMany({ where: { userId: { in: userIds }, period: { lte: lastMonth } } });
}

function buildKpiRows(
  users: KpiUser[],
  period: KpiPeriod,
  now: Date,
  actuals: Map<string, Actuals>,
  targets: TargetRow[]
) {
  const months = targetMonths(period, kpiPeriodRange(period, now), now);
  const out = new Map<string, KpiRow[]>();
  for (const user of users) {
    const userTargets = targets.filter((t) => t.userId === user.id);
    out.set(
      user.id,
      kpisForAccess(user.access).map((kpi) => {
        const forKpi = userTargets.filter((t) => t.kpi === kpi);
        const perMonth = months.map((m) => targetFor(forKpi, m));
        const monthly = perMonth.reduce((sum, t) => sum + (t?.target ?? 0), 0);
        const current = targetFor(forKpi, monthKey(now)) ?? perMonth.find(Boolean);
        return {
          kpi,
          label: KPI_LABEL[kpi],
          actual: actuals.get(user.id)![kpi],
          target: monthly > 0 ? scaleTarget(period, monthly, now) : null,
          weight: current?.weight ?? 1,
        };
      })
    );
  }
  return out;
}

/** KPI rows for many users at once — one set of queries regardless of team size. */
export async function getKpisForUsers(users: KpiUser[], period: KpiPeriod = "month", now = new Date()) {
  if (users.length === 0) return new Map<string, KpiRow[]>();

  const range = kpiPeriodRange(period, now);
  const months = targetMonths(period, range, now);
  const ids = users.map((u) => u.id);
  const [actuals, targets] = await Promise.all([computeActuals(ids, range), loadTargets(ids, months[months.length - 1]!)]);
  return buildKpiRows(users, period, now, actuals, targets);
}

export async function getUserKpis(user: KpiUser, period: KpiPeriod = "month"): Promise<KpiRow[]> {
  return (await getKpisForUsers([user], period)).get(user.id) ?? [];
}

/**
 * Weighted achievement across the KPIs that have a target:
 * Σ(weight × min(actual/target, 1)) / Σ weight, as a 0–100 score.
 * Null when nothing has a target yet.
 */
export function weightedScore(rows: KpiRow[]): number | null {
  const scored = rows.filter((r) => r.target && r.target > 0);
  const totalWeight = scored.reduce((sum, r) => sum + r.weight, 0);
  if (scored.length === 0 || totalWeight === 0) return null;
  const achieved = scored.reduce((sum, r) => sum + r.weight * Math.min(1, r.actual / r.target!), 0);
  return Math.round((achieved / totalWeight) * 100);
}

export type KpiMonth = {
  /** "2026-09" */
  month: string;
  /** "Sep" — for chart axes */
  label: string;
  rows: KpiRow[];
  score: number | null;
};

/**
 * Month-by-month KPI results for the last `months` months (oldest first,
 * current month last) — performance over time, per person.
 */
export async function getKpiHistory(users: KpiUser[], months = 6): Promise<Map<string, KpiMonth[]>> {
  const out = new Map<string, KpiMonth[]>(users.map((u) => [u.id, []]));
  if (users.length === 0) return out;
  const { year, month } = istParts(new Date());

  // Mid-month instant of each month, so the IST month is unambiguous.
  const anchors = Array.from(
    { length: months },
    (_, i) => new Date(istMidnight(year, month - (months - 1 - i), 15).getTime())
  );
  const ids = users.map((u) => u.id);
  // One set of queries for the whole window rather than one per month.
  const [actualsPerMonth, targets] = await Promise.all([
    computeActualsPerRange(ids, anchors.map((a) => kpiPeriodRange("month", a))),
    loadTargets(ids, monthKey(anchors[anchors.length - 1]!)),
  ]);
  const perMonth = anchors.map((anchor, i) => ({
    anchor,
    rows: buildKpiRows(users, "month", anchor, actualsPerMonth[i]!, targets),
  }));

  for (const { anchor, rows } of perMonth) {
    const key = monthKey(anchor);
    const label = MONTH_LABEL[istParts(anchor).month]!;
    for (const user of users) {
      const userRows = rows.get(user.id) ?? [];
      out.get(user.id)!.push({ month: key, label, rows: userRows, score: weightedScore(userRows) });
    }
  }
  return out;
}

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
