"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotifications } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { canViewProject, canViewTask } from "@/lib/visibility";
import { CommentEntityType } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

const FIELD_BY_TYPE = {
  TASK: "taskId",
  PROJECT: "projectId",
  EVENT: "eventId",
} as const;

const inputSchema = z.object({
  entityType: z.nativeEnum(CommentEntityType),
  entityId: z.string(),
  body: z.string().trim().min(1, "Comment can't be empty").max(4000, "Comment is too long"),
});

export async function addComment(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { entityType, entityId, body } = parsed.data;

  // Who gets told, and what the activity feed calls the record.
  let label = "";
  let projectId: string | null = null;
  let recipients: (string | null)[] = [];
  let link = "/";

  if (entityType === "TASK") {
    if (!(await canViewTask(user, entityId))) return { ok: false, error: "You don't have access to this task." };
    const task = await db.task.findUnique({
      where: { id: entityId },
      select: { title: true, projectId: true, assigneeId: true, createdById: true },
    });
    if (!task) return { ok: false, error: "Task not found" };
    label = task.title;
    projectId = task.projectId;
    recipients = [task.assigneeId, task.createdById];
    link = task.projectId ? `/projects/${task.projectId}` : "/tasks";
  } else if (entityType === "PROJECT") {
    if (!(await canViewProject(user, entityId))) return { ok: false, error: "You don't have access to this project." };
    const project = await db.project.findUnique({
      where: { id: entityId },
      select: { name: true, leadId: true, members: { select: { id: true } } },
    });
    if (!project) return { ok: false, error: "Project not found" };
    label = project.name;
    projectId = entityId;
    recipients = [project.leadId, ...project.members.map((m) => m.id)];
    link = `/projects/${entityId}`;
  } else {
    // The event catalogue is shared across the organisation.
    const event = await db.event.findUnique({ where: { id: entityId }, select: { name: true } });
    if (!event) return { ok: false, error: "Event not found" };
    label = event.name;
    link = "/discovery";
  }

  await db.comment.create({
    data: {
      entityType,
      [FIELD_BY_TYPE[entityType]]: entityId,
      userId: user.id,
      body,
    },
  });

  await logActivity(user.id, "comment.added", entityType, entityId, { label, projectId });
  await createNotifications(
    recipients.filter((id) => id !== user.id),
    `${user.name} commented on "${label}"`,
    link
  );

  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/projects", "layout");
  revalidatePath("/discovery");
  return { ok: true };
}
