import { NextResponse, type NextRequest } from "next/server";

import { canManageAll } from "@/lib/access";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { KPI_LABEL, KPI_PERIOD_LABEL, parseKpiPeriod } from "@/lib/kpi-constants";
import { getTeamPerformance, toCsv } from "@/lib/report-data";
import { getCurrentUser } from "@/lib/session";
import { PRIORITY_LABEL, STATUS_LABEL, isOverdue } from "@/lib/task-constants";
import type { KpiMetric } from "@prisma/client";

/** Admin CSV exports: ?type=team (default) | tasks, &period=today|week|month|quarter|year */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageAll(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const period = parseKpiPeriod(params.get("period") ?? undefined);
  const type = params.get("type") === "tasks" ? "tasks" : "team";
  const stamp = new Date().toISOString().slice(0, 10);

  let csv: string;
  if (type === "team") {
    const { rows } = await getTeamPerformance(period);
    // One column pair per KPI anyone is measured on, in a stable order.
    const kpiColumns = [...new Set(rows.flatMap((r) => r.allKpis.map((k) => k.kpi)))] as KpiMetric[];
    csv = toCsv(
      [
        "Member",
        "Email",
        "Role",
        "Access",
        `Weighted score % (${KPI_PERIOD_LABEL[period]})`,
        ...kpiColumns.flatMap((k) => [`${KPI_LABEL[k]} actual`, `${KPI_LABEL[k]} target`]),
        "Tasks completed",
        "On-time %",
        "Overdue now",
        "Daily updates",
        "Events registered",
        "Events attended",
        "Events conducted",
      ],
      rows.map((r) => [
        r.name,
        r.email,
        r.role,
        ACCESS_LABEL[r.access],
        r.score,
        ...kpiColumns.flatMap((k): (number | null | string)[] => {
          const row = r.allKpis.find((x) => x.kpi === k);
          return row ? [row.actual, row.target] : ["", ""];
        }),
        r.completed,
        r.onTime,
        r.overdue,
        r.updates,
        r.registered,
        r.attended,
        r.conducted,
      ])
    );
  } else {
    const tasks = await db.task.findMany({
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
        lead: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
    });
    csv = toCsv(
      ["Task", "Status", "Priority", "Assignee", "Project", "Lead", "Created by", "Created", "Due", "Completed", "Overdue"],
      tasks.map((t) => [
        t.title,
        STATUS_LABEL[t.status],
        PRIORITY_LABEL[t.priority],
        t.assignee.name,
        t.project?.name,
        t.lead?.name,
        t.createdBy?.name,
        formatDate(t.createdAt),
        t.dueDate ? formatDate(t.dueDate) : "",
        t.completedAt ? formatDate(t.completedAt) : "",
        isOverdue(t) ? "Yes" : "",
      ])
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nucleo-${type}-${type === "team" ? `${period}-` : ""}${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
