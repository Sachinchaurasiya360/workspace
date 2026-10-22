"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectAccess, canManageAll } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotifications } from "@/lib/notifications";
import { isValidDateString } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { Prisma, ProjectStatus } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

async function generateProjectCode(): Promise<string> {
  const projects = await db.project.findMany({
    where: { projectCode: { startsWith: "PRJ-" } },
    select: { projectCode: true },
  });
  const maxN = projects.reduce((max, p) => {
    const n = Number(p.projectCode.replace("PRJ-", ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `PRJ-${String(maxN + 1).padStart(2, "0")}`;
}

const projectInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  department: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  overallStatus: z.nativeEnum(ProjectStatus).default(ProjectStatus.NOT_STARTED),
  targetMonth: z.string().optional().nullable(),
  startDate: z.string().refine(isValidDateString, "Enter a valid start date").optional().nullable().or(z.literal("")),
  dueDate: z.string().refine(isValidDateString, "Enter a valid due date").optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
});

/** Only active members can be added to a project. */
async function activeIds(ids: string[] | undefined) {
  if (!ids?.length) return ids;
  const rows = await db.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

function revalidateProjectViews() {
  revalidatePath("/projects", "layout");
  revalidatePath("/");
}

async function notifyProjectPeople(
  projectId: string,
  actorId: string,
  message: string,
  skipIds: string[] = []
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { leadId: true, members: { select: { id: true } } },
  });
  const ids = new Set([project?.leadId, ...(project?.members.map((m) => m.id) ?? [])]);
  for (const skip of [actorId, ...skipIds]) ids.delete(skip);
  await createNotifications(ids, message, `/projects/${projectId}`);
}

export async function createProject(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const leadId = data.leadId && canManageAll(user) ? data.leadId : user.id;
  const memberIds = await activeIds(data.memberIds);

  // Two people creating a project at once can race for the same code; retry.
  let project;
  for (let attempt = 0; ; attempt++) {
    try {
      project = await db.project.create({
        data: {
          projectCode: await generateProjectCode(),
          name: data.name,
          department: data.department || null,
          leadId,
          overallStatus: data.overallStatus,
          targetMonth: data.targetMonth || null,
          startDate: data.startDate ? new Date(data.startDate) : null,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          notes: data.notes || null,
          createdById: user.id,
          ...(memberIds?.length ? { members: { connect: memberIds.map((id) => ({ id })) } } : {}),
        },
      });
      break;
    } catch (e) {
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }

  await logActivity(user.id, "project.created", "PROJECT", project.id, { label: project.name, projectId: project.id });
  await notifyProjectPeople(project.id, user.id, `${user.name} added you to project "${project.name}"`);
  revalidateProjectViews();
  return { ok: true };
}

const updateProjectSchema = projectInputSchema.partial().extend({ id: z.string() });

export async function updateProject(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;
  if (data.memberIds) data.memberIds = await activeIds(data.memberIds);

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return { ok: false, error: "Project not found" };
  try {
    assertProjectAccess(user, project);
  } catch {
    return { ok: false, error: "Only the project lead or an admin can edit this project." };
  }

  const previousMembers = await db.project
    .findUnique({ where: { id }, select: { members: { select: { id: true } } } })
    .then((p) => new Set(p?.members.map((m) => m.id) ?? []));

  const updated = await db.project.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.department !== undefined ? { department: data.department || null } : {}),
      ...(data.overallStatus !== undefined ? { overallStatus: data.overallStatus } : {}),
      ...(data.targetMonth !== undefined ? { targetMonth: data.targetMonth || null } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
      ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
      ...(data.leadId && canManageAll(user) ? { leadId: data.leadId } : {}),
      ...(data.memberIds !== undefined ? { members: { set: data.memberIds.map((memberId) => ({ id: memberId })) } } : {}),
    },
  });

  await logActivity(user.id, "project.updated", "PROJECT", id, { label: updated.name, projectId: id });
  const added = (data.memberIds ?? []).filter((m) => !previousMembers.has(m) && m !== user.id);
  await createNotifications(added, `${user.name} added you to project "${updated.name}"`, `/projects/${id}`);
  await notifyProjectPeople(id, user.id, `${user.name} updated project "${updated.name}"`, added);
  revalidateProjectViews();
  return { ok: true };
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  const user = await requireUser();
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return { ok: false, error: "Project not found" };
  try {
    assertProjectAccess(user, project);
  } catch {
    return { ok: false, error: "Only the project lead or an admin can delete this project." };
  }

  await db.project.delete({ where: { id: projectId } });
  await logActivity(user.id, "project.deleted", "PROJECT", projectId, { label: project.name });
  revalidateProjectViews();
  return { ok: true };
}
