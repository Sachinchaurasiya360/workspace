import { endOfDateOnly, startOfToday } from "@/lib/dates";
import { db } from "@/lib/db";
import { getKpisForUsers, kpiPeriodRange, weightedScore } from "@/lib/kpi";
import { kpisForAccess, type KpiPeriod } from "@/lib/kpi-constants";

/**
 * Per-member performance for a period — one source for the Reports page and
 * its CSV export, so both always show the same numbers.
 */
export async function getTeamPerformance(period: KpiPeriod) {
  const range = kpiPeriodRange(period);
  const inPeriod = { gte: range.start, lt: range.end };
  const today = startOfToday();

  const [members, completed, overdue, dueCompleted, dailyCounts, attendedRows, conductedRows, registeredRows] =
    await Promise.all([
      db.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, role: true, email: true, access: true },
        orderBy: { name: "asc" },
      }),
      db.task.groupBy({ by: ["assigneeId"], where: { status: "COMPLETED", completedAt: inPeriod }, _count: { _all: true } }),
      db.task.groupBy({ by: ["assigneeId"], where: { status: { not: "COMPLETED" }, dueDate: { lt: today } }, _count: { _all: true } }),
      db.task.findMany({
        where: { status: "COMPLETED", completedAt: inPeriod, dueDate: { not: null } },
        select: { assigneeId: true, dueDate: true, completedAt: true },
      }),
      db.dailyLog.groupBy({ by: ["userId"], where: { createdAt: inPeriod }, _count: { _all: true } }),
      // Participation and execution are separate tracks, each counted on its own milestone time.
      db.eventOverview.groupBy({ by: ["userId"], where: { participation: "ATTENDED", attendedAt: inPeriod }, _count: { _all: true } }),
      db.eventOverview.groupBy({ by: ["userId"], where: { execution: "CONDUCTED", conductedAt: inPeriod }, _count: { _all: true } }),
      db.eventOverview.groupBy({ by: ["userId"], where: { participation: "REGISTERED", createdAt: inPeriod }, _count: { _all: true } }),
    ]);
  const kpis = await getKpisForUsers(members, period);

  const countFor = <T extends { _count: { _all: number } }>(rows: T[], match: (r: T) => boolean) =>
    rows.filter(match).reduce((s, r) => s + r._count._all, 0);

  const rows = members.map((m) => {
    const ontimeSource = dueCompleted.filter((t) => t.assigneeId === m.id);
    const onTime = ontimeSource.filter((t) => t.completedAt! < endOfDateOnly(t.dueDate!)).length;
    return {
      ...m,
      score: kpisForAccess(m.access).length ? weightedScore(kpis.get(m.id) ?? []) : null,
      kpis: (kpis.get(m.id) ?? []).filter((k) => k.target),
      allKpis: kpis.get(m.id) ?? [],
      completed: countFor(completed, (c) => c.assigneeId === m.id),
      overdue: countFor(overdue, (c) => c.assigneeId === m.id),
      onTime: ontimeSource.length ? Math.round((onTime / ontimeSource.length) * 100) : null,
      updates: countFor(dailyCounts, (d) => d.userId === m.id),
      attended: countFor(attendedRows, (e) => e.userId === m.id),
      conducted: countFor(conductedRows, (e) => e.userId === m.id),
      registered: countFor(registeredRows, (e) => e.userId === m.id),
    };
  });

  return { members, rows };
}

export type TeamPerformanceRow = Awaited<ReturnType<typeof getTeamPerformance>>["rows"][number];

/** RFC 4180 CSV; a leading BOM so Excel opens UTF-8 names (₹, accents) correctly. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection from user-entered text.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
