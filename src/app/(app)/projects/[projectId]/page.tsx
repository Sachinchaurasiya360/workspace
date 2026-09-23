import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/auth";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { getCommentCounts, getComments } from "@/lib/comments";
import { getProjectProgress } from "@/lib/project-progress";
import type { TaskStatus } from "@prisma/client";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To Do" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "PENDING_APPROVAL", label: "Pending Approval" },
  { status: "COMPLETED", label: "Completed" },
];

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const session = await auth();
  const user = session!.user;
  const isAdmin = canManageAll(user);

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { lead: { select: { name: true } } },
  });
  if (!project) notFound();

  const [tasks, allProjects] = await Promise.all([
    db.task.findMany({
      where: { projectId },
      include: { project: { select: { name: true } }, assignee: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const commentCounts = await getCommentCounts("TASK", tasks.map((t) => t.id));
  const comments = await db.comment.findMany({
    where: { taskId: { in: tasks.map((t) => t.id) } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const projectComments = await getComments("PROJECT", projectId);
  const progress = await getProjectProgress(projectId);

  const taskRows: TaskRowData[] = tasks.map((t) => ({ ...t, commentCount: commentCounts.get(t.id) ?? 0 }));
  const canEditProject = isAdmin || project.leadId === user.id;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            {canEditProject && (
              <ProjectFormDialog
                mode="edit"
                project={project}
                comments={projectComments}
                canDelete
                trigger={
                  <Button size="icon" variant="ghost">
                    <Pencil className="size-4" />
                  </Button>
                }
              />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Lead: {project.lead?.name ?? "Unassigned"}
            {project.department ? ` · ${project.department}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <Progress value={progress.percent} className="w-40" />
            <span className="text-xs text-muted-foreground">
              {progress.completed}/{progress.total} tasks · {progress.percent}%
            </span>
          </div>
        </div>
        <TaskFormDialog
          mode="create"
          projects={allProjects.map((p) => ({ id: p.id, name: p.name }))}
          defaultProjectId={projectId}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const columnTasks = taskRows.filter((t) => t.status === col.status);
          if (columnTasks.length === 0 && col.status === "PENDING_APPROVAL") return null;
          return (
            <div key={col.status} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="outline">{columnTasks.length}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {columnTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    comments={comments.filter((c) => c.taskId === t.id)}
                    projects={allProjects}
                    currentUser={user}
                    showAssignee
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
