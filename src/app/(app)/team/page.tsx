import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { EditMemberDialog } from "@/components/team/edit-member-dialog";
import { KpiTargetDialog } from "@/components/team/kpi-target-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { canManageAll, hasSalesAccess, hasTaskAccess } from "@/lib/access";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { db } from "@/lib/db";
import { getKpisForUsers, weightedScore } from "@/lib/kpi";
import { currentPeriod, kpisForAccess } from "@/lib/kpi-constants";
import { getCurrentUser } from "@/lib/session";
import { startOfToday } from "@/lib/events";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user || !canManageAll(user)) redirect("/");

  const today = startOfToday();
  const [members, kpiTargets, taskStats, overdue] = await Promise.all([
    db.user.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { tasksAssigned: true, leadsOwned: true, projectsLed: true } } },
    }),
    db.kpiTarget.findMany({ where: { period: currentPeriod() } }),
    db.task.groupBy({ by: ["assigneeId", "status"], _count: { _all: true } }),
    db.task.groupBy({
      by: ["assigneeId"],
      where: { status: { not: "COMPLETED" }, dueDate: { lt: today } },
      _count: { _all: true },
    }),
  ]);

  const active = members.filter((m) => m.isActive);
  const inactive = members.filter((m) => !m.isActive);
  const kpis = await getKpisForUsers(active, "month");
  const people = active.map((m) => ({ id: m.id, name: m.name }));
  const viewer = { id: user.id, isFounder: user.isFounder };
  const memberProps = (m: (typeof members)[number]) => ({
    ...m,
    owned: { tasks: m._count.tasksAssigned, leads: m._count.leadsOwned, projects: m._count.projectsLed },
  });
  // Your own row opens your operational dashboard (or the overview if you have none).
  const ownDashboard = hasTaskAccess(user) || hasSalesAccess(user) ? "/?view=me" : "/";

  const stat = (id: string) => {
    const rows = taskStats.filter((t) => t.assigneeId === id);
    const total = rows.reduce((sum, r) => sum + r._count._all, 0);
    const done = rows.find((r) => r.status === "COMPLETED")?._count._all ?? 0;
    return { total, done, overdue: overdue.find((o) => o.assigneeId === id)?._count._all ?? 0 };
  };

  const memberCols = "lg:grid-cols-[minmax(0,1fr)_150px_120px_110px_80px_auto]";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {active.length} active · {inactive.length} inactive
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Team</h1>
        </div>
        <AddMemberDialog />
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className={`hidden h-11 items-center gap-3.5 border-b border-border bg-[#FBFAF7] px-[18px] text-xs font-semibold text-muted-foreground lg:grid ${memberCols}`}
        >
          <span>Member</span>
          <span>Access</span>
          <span>Tasks</span>
          <span title="Weighted KPI achievement this month">Score</span>
          <span>Status</span>
          <span className="sr-only">Actions</span>
        </div>

        {active.map((m) => {
          const s = stat(m.id);
          const score = weightedScore(kpis.get(m.id) ?? []);
          const hasKpis = kpisForAccess(m.access).length > 0;
          return (
            <div
              key={m.id}
              className={`grid grid-cols-1 items-center gap-x-3.5 gap-y-2 border-b border-[#EFEDE6] px-[18px] py-3 last:border-b-0 lg:min-h-16 lg:py-2.5 ${memberCols}`}
            >
              <MemberIdentity name={m.name} role={m.role} email={m.email} phone={m.phone} isFounder={m.isFounder} />

              <div className="flex flex-wrap items-center gap-2 lg:contents">
                <span className="justify-self-start rounded-lg bg-background px-[9px] py-[3px] text-xs font-semibold text-secondary-foreground">
                  {ACCESS_LABEL[m.access]}
                </span>

                <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    <span className="font-mono text-sm font-medium text-foreground">{s.done}</span>/{s.total} done
                  </span>
                  {s.overdue > 0 && <Badge variant="destructive">{s.overdue} overdue</Badge>}
                </span>

                <span className="flex items-center gap-2" title="Weighted KPI achievement this month">
                  {hasKpis ? (
                    score === null ? (
                      <span className="text-xs text-muted-foreground">No targets</span>
                    ) : (
                      <>
                        <span className="w-10 font-mono text-sm font-medium">{score}%</span>
                        <Progress
                          value={score}
                          className={`w-14 ${score < 50 ? "[&>[data-slot=progress-indicator]]:bg-warning" : ""}`}
                        />
                      </>
                    )
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">—</span>
                  )}
                </span>

                <span className="justify-self-start rounded-lg bg-[#D5EFE4] px-[9px] py-[3px] text-xs font-semibold text-[#135C40]">
                  Active
                </span>
              </div>

              <div className="flex items-center gap-1 lg:justify-end">
                <Button asChild size="sm" variant="ghost">
                  <Link href={m.id === user.id ? ownDashboard : `/?viewAs=${m.id}`}>
                    <LayoutDashboard /> Dashboard
                  </Link>
                </Button>
                {hasKpis && (
                  <KpiTargetDialog
                    userId={m.id}
                    memberName={m.name}
                    access={m.access}
                    existingTargets={kpiTargets
                      .filter((t) => t.userId === m.id)
                      .map((t) => ({ kpi: t.kpi, target: t.target, weight: t.weight }))}
                  />
                )}
                <EditMemberDialog member={memberProps(m)} people={people} viewer={viewer} />
              </div>
            </div>
          );
        })}

        {inactive.map((m) => (
          <div
            key={m.id}
            className={`grid grid-cols-1 items-center gap-x-3.5 gap-y-2 border-b border-[#EFEDE6] px-[18px] py-3 last:border-b-0 lg:min-h-16 lg:py-2.5 ${memberCols}`}
          >
            <div className="opacity-70">
              <MemberIdentity name={m.name} role={m.role} email={m.email} phone={null} isFounder={m.isFounder} />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:contents">
              <span className="justify-self-start rounded-lg bg-background px-[9px] py-[3px] text-xs font-semibold text-muted-foreground">
                {ACCESS_LABEL[m.access]}
              </span>
              <span className="hidden lg:block" />
              <span className="hidden font-mono text-sm text-muted-foreground lg:block">—</span>
              <span className="justify-self-start rounded-lg bg-muted px-[9px] py-[3px] text-xs font-semibold text-muted-foreground">
                Inactive
              </span>
            </div>
            <div className="flex items-center gap-1 lg:justify-end">
              <EditMemberDialog member={memberProps(m)} people={people} viewer={viewer} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MemberIdentity({
  name,
  role,
  email,
  phone,
  isFounder,
}: {
  name: string;
  role: string;
  email: string;
  phone: string | null;
  isFounder: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {initials(name)}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {name}
          {isFounder && <Badge variant="primary">Founder</Badge>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {role} · {email}
          {phone ? ` · ${phone}` : ""}
        </span>
      </div>
    </div>
  );
}
