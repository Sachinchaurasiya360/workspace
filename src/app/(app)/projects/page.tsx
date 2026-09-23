import Link from "next/link";

import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/auth";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { getProjectProgressMap } from "@/lib/project-progress";

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
};

export default async function ProjectsPage() {
  const session = await auth();
  const user = session!.user;
  const isAdmin = canManageAll(user);

  const projects = await db.project.findMany({
    where: isAdmin ? {} : { OR: [{ leadId: user.id }, { tasks: { some: { assigneeId: user.id } } }] },
    include: { lead: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const progressMap = await getProjectProgressMap(projects.map((p) => p.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "All projects across the team." : "Projects you lead or contribute to."}
          </p>
        </div>
        <ProjectFormDialog mode="create" />
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Add your first project to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const progress = progressMap.get(p.id)!;
            return (
              <Link key={p.id} href={`/projects/${p.id}`}>
                <Card className="transition-colors hover:bg-secondary/30">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{p.name}</CardTitle>
                      <Badge variant="outline">{STATUS_LABEL[p.overallStatus]}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <Progress value={progress.percent} />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Lead: {p.lead?.name ?? "Unassigned"}</span>
                      <span>
                        {progress.completed}/{progress.total} tasks
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
