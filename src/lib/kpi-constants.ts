import type { KpiMetric } from "@prisma/client";

// Pure, client-safe constants split out of lib/kpi.ts (which also touches the
// database) — importing that file from a "use client" component would pull
// `pg`/Node built-ins into the browser bundle.
export const KPI_LABEL: Record<KpiMetric, string> = {
  CALLS: "Calls",
  DISCOVERY: "Discovery Demos",
  PROFILES: "Profiles & Signups",
  FOLLOW_UPS: "Follow-ups",
  DEALS_CLOSED: "Deals Closed",
  EVENTS_ATTENDED: "Events Attended",
  EVENTS_CONDUCTED: "Events Conducted",
  TASKS_COMPLETED: "Tasks Completed",
};

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
