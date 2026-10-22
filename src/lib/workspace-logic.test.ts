import { describe, expect, it, vi } from "vitest";

// kpi.ts imports the Prisma client; these tests only touch its pure helpers.
vi.mock("@/lib/db", () => ({ db: {} }));

import { hasSalesAccess, hasTaskAccess, isEngineering } from "@/lib/access";
import { isFreeEvent } from "@/lib/events";
import { kpiPeriodRange, weightedScore, type KpiRow } from "@/lib/kpi";
import { SALES_KPIS, TASK_KPIS, kpisForAccess, parseKpiPeriod } from "@/lib/kpi-constants";
import { isOverdue } from "@/lib/task-constants";
import { toCsv } from "@/lib/report-data";

const row = (actual: number, target: number | null, weight = 1): KpiRow => ({
  kpi: "CALLS",
  label: "Calls",
  actual,
  target,
  weight,
});

describe("weightedScore", () => {
  it("is null when no KPI has a target", () => {
    expect(weightedScore([row(5, null)])).toBeNull();
  });

  it("caps each KPI at 100% so over-achievement can't mask a miss", () => {
    expect(weightedScore([row(300, 100), row(0, 100)])).toBe(50);
  });

  it("weights KPIs by their weight", () => {
    // 100% on weight 3, 0% on weight 1 → 75%
    expect(weightedScore([row(10, 10, 3), row(0, 10, 1)])).toBe(75);
  });

  it("ignores KPIs without targets", () => {
    expect(weightedScore([row(5, 10), row(99, null)])).toBe(50);
  });
});

describe("kpiPeriodRange (IST calendar, any server time zone)", () => {
  const wed = new Date("2026-09-30T09:30:00Z"); // Wed 30 Sep 2026, 15:00 IST

  it("week starts on Monday at IST midnight", () => {
    const { start, end } = kpiPeriodRange("week", wed);
    expect(start.toISOString()).toBe("2026-09-27T18:30:00.000Z"); // Mon 28 Sep 00:00 IST
    expect(end.toISOString()).toBe("2026-10-04T18:30:00.000Z");
  });

  it("quarter covers Jul–Sep for a September date", () => {
    const { start, end } = kpiPeriodRange("quarter", wed);
    expect(start.toISOString()).toBe("2026-06-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("just after midnight IST is already the new day (server may still be on yesterday in UTC)", () => {
    const earlyIST = new Date("2026-09-30T19:00:00Z"); // 1 Oct 00:30 IST
    expect(kpiPeriodRange("today", earlyIST).start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(kpiPeriodRange("month", earlyIST).start.toISOString()).toBe("2026-09-30T18:30:00.000Z"); // October
  });

  it("today is a single day", () => {
    const { start, end } = kpiPeriodRange("today", wed);
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("falls back to month for unknown periods", () => {
    expect(parseKpiPeriod("decade")).toBe("month");
    expect(parseKpiPeriod("week")).toBe("week");
  });
});

describe("role-based KPIs", () => {
  it("engineering is measured on task delivery, not sales", () => {
    expect(kpisForAccess("ENGINEERING")).toEqual(TASK_KPIS);
    expect(isEngineering({ access: "ENGINEERING" })).toBe(true);
    expect(hasTaskAccess({ access: "ENGINEERING" })).toBe(true);
    expect(hasSalesAccess({ access: "ENGINEERING" })).toBe(false);
  });

  it("admin + sales gets sales KPIs", () => {
    expect(kpisForAccess("ADMIN_SALES_BASED")).toEqual(SALES_KPIS);
    expect(hasSalesAccess({ access: "ADMIN_SALES_BASED" })).toBe(true);
  });

  it("sales + task users get both sets", () => {
    expect(kpisForAccess("SALES_TASK_BASED")).toEqual([...SALES_KPIS, ...TASK_KPIS]);
  });

  it("pure admin access has no personal KPIs", () => {
    expect(kpisForAccess("ADMIN")).toEqual([]);
  });

  it("sales KPIs include meetings", () => {
    expect(SALES_KPIS).toContain("MEETINGS");
  });
});

describe("isFreeEvent", () => {
  it.each([
    ["Free", true],
    ["free entry", true],
    ["0", true],
    ["₹0", true],
    ["$0.00", true],
    ["₹2,500", false],
    ["$10", false],
    ["100", false],
    // Real legacy values that must NOT skip approval:
    ["USD 9-99 (~Free-INR 9,999)", false],
    ["Free for students, ₹500 otherwise", false],
    ["Paid (tiered)", false],
    ["TBC", false],
  ])("%s → %s", (price, expected) => {
    expect(isFreeEvent(price)).toBe(expected);
  });

  it("with no price, relies on the registration note and otherwise needs approval", () => {
    expect(isFreeEvent(null, "Free RSVP - direct event page")).toBe(true);
    expect(isFreeEvent(null, "Ticketed - direct event page")).toBe(false);
    expect(isFreeEvent(null, "Open")).toBe(false);
    expect(isFreeEvent(null, null)).toBe(false);
  });
});

describe("isOverdue (date-only due dates, IST days)", () => {
  // Due dates arrive from <input type="date"> as UTC midnight of the calendar day.
  const due29 = new Date("2026-09-29T00:00:00Z");

  it("is not overdue at any point on the due date in IST", () => {
    expect(isOverdue({ dueDate: due29, status: "TODO" }, new Date("2026-09-28T19:00:00Z"))).toBe(false); // 29th 00:30 IST
    expect(isOverdue({ dueDate: due29, status: "TODO" }, new Date("2026-09-29T18:00:00Z"))).toBe(false); // 29th 23:30 IST
  });

  it("becomes overdue at IST midnight after the due date", () => {
    expect(isOverdue({ dueDate: due29, status: "IN_PROGRESS" }, new Date("2026-09-29T18:31:00Z"))).toBe(true); // 30th 00:01 IST
  });

  it("completed tasks are never overdue", () => {
    expect(isOverdue({ dueDate: new Date("2026-01-01T00:00:00Z"), status: "COMPLETED" }, new Date("2026-09-29T10:00:00Z"))).toBe(false);
  });

  it("tasks without a due date are never overdue", () => {
    expect(isOverdue({ dueDate: null, status: "TODO" }, new Date())).toBe(false);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    const csv = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line\nbreak", null]]);
    expect(csv).toBe('\uFEFFa,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",\r\n');
  });

  it("neutralises spreadsheet formulas in user text", () => {
    expect(toCsv(["t"], [["=HYPERLINK(1)"], ["-5"], ["@cmd"]])).toBe("\uFEFFt\r\n'=HYPERLINK(1)\r\n'-5\r\n'@cmd\r\n");
  });
});
