import { db } from "@/lib/db";
import { KPI_LABEL, currentPeriod } from "@/lib/kpi-constants";
import { KpiMetric } from "@prisma/client";

export { KPI_LABEL, currentPeriod };

function periodRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}

export type KpiRow = { kpi: KpiMetric; label: string; actual: number; target: number | null };

export async function getUserKpis(userId: string, period = currentPeriod()): Promise<KpiRow[]> {
  const { start, end } = periodRange(period);

  const [logs, targets, eventsAttended, eventsConducted, tasksCompleted] = await Promise.all([
    db.dailyLog.aggregate({
      where: { userId, createdAt: { gte: start, lt: end } },
      _sum: { callsMade: true, followUps: true, dealsClosed: true, discoveryDemos: true, profilesSignups: true },
    }),
    db.kpiTarget.findMany({ where: { userId, period } }),
    db.eventOverview.count({ where: { userId, status: "ATTENDED", updatedAt: { gte: start, lt: end } } }),
    db.eventOverview.count({ where: { userId, status: "CONDUCTED", updatedAt: { gte: start, lt: end } } }),
    db.task.count({ where: { assigneeId: userId, status: "COMPLETED", updatedAt: { gte: start, lt: end } } }),
  ]);

  const actuals: Record<KpiMetric, number> = {
    CALLS: logs._sum.callsMade ?? 0,
    FOLLOW_UPS: logs._sum.followUps ?? 0,
    DEALS_CLOSED: logs._sum.dealsClosed ?? 0,
    DISCOVERY: logs._sum.discoveryDemos ?? 0,
    PROFILES: logs._sum.profilesSignups ?? 0,
    EVENTS_ATTENDED: eventsAttended,
    EVENTS_CONDUCTED: eventsConducted,
    TASKS_COMPLETED: tasksCompleted,
  };

  const targetMap = new Map(targets.map((t) => [t.kpi, t.target]));

  return (Object.keys(actuals) as KpiMetric[]).map((kpi) => ({
    kpi,
    label: KPI_LABEL[kpi],
    actual: actuals[kpi],
    target: targetMap.get(kpi) ?? null,
  }));
}
