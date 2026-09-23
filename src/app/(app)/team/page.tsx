import { redirect } from "next/navigation";

import { AddMemberDialog } from "@/components/team/add-member-dialog";
import { KpiTargetDialog } from "@/components/team/kpi-target-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { currentPeriod } from "@/lib/kpi";

const ACCESS_LABEL: Record<string, string> = {
  TASK_BASED: "Task based",
  SALES_BASED: "Sales based",
  ADMIN: "Admin",
  ADMIN_TASK_BASED: "Admin + Task based",
  SALES_TASK_BASED: "Sales based + Task based",
};

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user || !canManageAll(session.user)) redirect("/");

  const members = await db.user.findMany({
    where: { isActive: true },
    include: { _count: { select: { tasksAssigned: true } } },
    orderBy: { name: "asc" },
  });
  const kpiTargets = await db.kpiTarget.findMany({ where: { period: currentPeriod() } });
  const targetsByUser = new Map<string, { kpi: (typeof kpiTargets)[number]["kpi"]; target: number }[]>();
  for (const t of kpiTargets) {
    targetsByUser.set(t.userId, [...(targetsByUser.get(t.userId) ?? []), { kpi: t.kpi, target: t.target }]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage team members, roles, and access levels.</p>
        </div>
        <AddMemberDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{members.length} members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">
                  {m.name} {m.isFounder && <Badge variant="primary">Founder</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.role} · {m.email}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">{ACCESS_LABEL[m.access]}</Badge>
                <span className="text-xs text-muted-foreground">{m._count.tasksAssigned} tasks</span>
                <KpiTargetDialog userId={m.id} memberName={m.name} existingTargets={targetsByUser.get(m.id) ?? []} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
