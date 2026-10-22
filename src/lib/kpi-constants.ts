import type { AccessLevel, KpiMetric } from "@prisma/client";

import { monthKeyIST } from "@/lib/dates";

// Pure, client-safe constants split out of lib/kpi.ts (which also touches the
// database) — importing that file from a "use client" component would pull
// `pg`/Node built-ins into the browser bundle.
export const KPI_LABEL: Record<KpiMetric, string> = {
  CALLS: "Calls",
  DISCOVERY: "Discovery Demos",
  PROFILES: "Profiles & Signups",
  FOLLOW_UPS: "Follow-ups",
  MEETINGS: "Meetings",
  DEALS_CLOSED: "Deals Closed",
  EVENTS_ATTENDED: "Events Attended",
  EVENTS_CONDUCTED: "Events Conducted",
  TASKS_COMPLETED: "Tasks Completed",
};

export const SALES_KPIS: KpiMetric[] = [
  "DEALS_CLOSED",
  "CALLS",
  "FOLLOW_UPS",
  "MEETINGS",
  "DISCOVERY",
  "PROFILES",
  "EVENTS_CONDUCTED",
  "EVENTS_ATTENDED",
];

export const TASK_KPIS: KpiMetric[] = ["TASKS_COMPLETED"];

/** Which KPIs a person is measured on, by access level. Pure-admin access has none. */
export function kpisForAccess(access: AccessLevel): KpiMetric[] {
  switch (access) {
    case "SALES_BASED":
    case "ADMIN_SALES_BASED":
      return SALES_KPIS;
    case "SALES_TASK_BASED":
      return [...SALES_KPIS, ...TASK_KPIS];
    case "TASK_BASED":
    case "ADMIN_TASK_BASED":
    case "ENGINEERING":
      return TASK_KPIS;
    case "ADMIN":
      return [];
  }
}

export const KPI_PERIODS = ["today", "week", "month", "quarter", "year"] as const;
export type KpiPeriod = (typeof KPI_PERIODS)[number];

export const KPI_PERIOD_LABEL: Record<KpiPeriod, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  quarter: "This quarter",
  year: "This year",
};

export function parseKpiPeriod(value: string | string[] | undefined): KpiPeriod {
  return KPI_PERIODS.includes(value as KpiPeriod) ? (value as KpiPeriod) : "month";
}

/** Month key used by KpiTarget.period, e.g. "2026-09" (IST calendar). */
export const monthKey = monthKeyIST;

export function currentPeriod() {
  return monthKeyIST(new Date());
}
