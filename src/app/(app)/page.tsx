import Link from "next/link";
import { ListTodo, Users as UsersIcon } from "lucide-react";

import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { DailyLogDialog } from "@/components/daily-logs/daily-log-dialog";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/auth";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { getCommentCounts } from "@/lib/comments";
import { getUserKpis } from "@/lib/kpi";
import { getProjectProgressMap } from "@/lib/project-progress";

export default async function DashboardPage() {
  const session = await auth();
  const user = session!.user;
  const isAdmin = canManageAll(user);

  const projects = await db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  if (isAdmin) {
    const [totalTasks, completedTasks, activeProjects, teamSize, approvals, recentProjects, teamMembers] =
      await Promise.all([
        db.task.count(),
        db.task.count({ where: { status: "COMPLETED" } }),
        db.project.count({ where: { overallStatus: "IN_PROGRESS" } }),
        db.user.count({ where: { isActive: true } }),
        db.approval.findMany({
          where: { status: "REQUEST_RAISED" },
          include: { requestedBy: { select: { name: true } }, task: { select: { title: true } }, event: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        }),
        db.project.findMany({ orderBy: { updatedAt: "desc" }, take: 5, include: { lead: { select: { name: true } } } }),
        db.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, role: true, _count: { select: { tasksAssigned: true } } },
        }),
      ]);

    const progressMap = await getProjectProgressMap(recentProjects.map((p) => p.id));
    const myKpis = await getUserKpis(user.id);
    const completedByUser = await db.task.groupBy({
      by: ["assigneeId"],
      where: { status: "COMPLETED" },
      _count: { _all: true },
    });
    const completedMap = new Map(completedByUser.map((c) => [c.assigneeId, c._count._all]));

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {user.name?.split(" ")[0]}.</p>
          </div>
          <div className="flex items-center gap-2">
            <DailyLogDialog />
            <Badge variant="primary">Admin view</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Total tasks", value: totalTasks },
            { label: "Completed", value: completedTasks },
            { label: "Active projects", value: activeProjects },
            { label: "Team members", value: teamSize },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-semibold">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <KpiTiles kpis={myKpis} />

        <Card>
          <CardHeader>
            <CardTitle>Approval queue</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalQueue approvals={approvals} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent projects</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {recentProjects.map((p) => {
                const progress = progressMap.get(p.id)!;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5 hover:bg-secondary/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{progress.percent}%</span>
                    </div>
                    <Progress value={progress.percent} />
                    <span className="text-xs text-muted-foreground">Lead: {p.lead?.name ?? "Unassigned"}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="size-4 text-muted-foreground" />
                Team
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {teamMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.role}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {completedMap.get(m.id) ?? 0}/{m._count.tasksAssigned} done
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Member view ----
  const [myTasksRaw, myProjectsRaw, eventOverview, recentLogs] = await Promise.all([
    db.task.findMany({
      where: { assigneeId: user.id },
      orderBy: [{ createdAt: "desc" }],
      include: { project: { select: { name: true } }, assignee: { select: { name: true } } },
    }),
    db.project.findMany({
      where: { OR: [{ leadId: user.id }, { tasks: { some: { assigneeId: user.id } } }] },
      distinct: ["id"],
    }),
    db.eventOverview.findMany({
      where: { userId: user.id },
      include: { event: { select: { name: true, date: true, city: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.dailyLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const commentCounts = await getCommentCounts("TASK", myTasksRaw.map((t) => t.id));
  const taskComments = await db.comment.findMany({
    where: { taskId: { in: myTasksRaw.map((t) => t.id) } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const myProgress = await getProjectProgressMap(myProjectsRaw.map((p) => p.id));
  const myKpis = await getUserKpis(user.id);

  const myTasks: TaskRowData[] = myTasksRaw.map((t) => ({
    ...t,
    commentCount: commentCounts.get(t.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Welcome back, {user.name?.split(" ")[0]}.</p>
        </div>
        <DailyLogDialog />
      </div>

      <KpiTiles kpis={myKpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="size-4 text-muted-foreground" />
              My tasks
            </CardTitle>
            <TaskFormDialog mode="create" projects={projects} />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {myTasks.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
            {myTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                comments={taskComments.filter((c) => c.taskId === t.id)}
                projects={projects}
                currentUser={user}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Active projects</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {myProjectsRaw.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
              {myProjectsRaw.map((p) => {
                const progress = myProgress.get(p.id)!;
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5 hover:bg-secondary/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="text-xs text-muted-foreground">{progress.percent}%</span>
                    </div>
                    <Progress value={progress.percent} />
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Event overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {eventOverview.length === 0 && <p className="text-sm text-muted-foreground">No events tracked yet.</p>}
              {eventOverview.map((eo) => (
                <div key={eo.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{eo.event.name}</p>
                    <p className="text-xs text-muted-foreground">{eo.event.city}</p>
                  </div>
                  <Badge variant="outline">{eo.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent updates</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recentLogs.length === 0 && <p className="text-sm text-muted-foreground">No recent activity.</p>}
              {recentLogs.map((log) => (
                <div key={log.id} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleDateString()} — {log.callsMade} calls, {log.followUps} follow-ups
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
