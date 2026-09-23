"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertProjectAccess, canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ProjectStatus } from "@prisma/client";
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
  startDate: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createProject(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = projectInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const leadId = data.leadId && canManageAll(user) ? data.leadId : user.id;
  const projectCode = await generateProjectCode();

  await db.project.create({
    data: {
      projectCode,
      name: data.name,
      department: data.department || null,
      leadId,
      overallStatus: data.overallStatus,
      targetMonth: data.targetMonth || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes || null,
      createdById: user.id,
    },
  });

  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true };
}

const updateProjectSchema = projectInputSchema.partial().extend({ id: z.string() });

export async function updateProject(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProjectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;

  const project = await db.project.findUnique({ where: { id } });
  if (!project) return { ok: false, error: "Project not found" };
  try {
    assertProjectAccess(user, project);
  } catch {
    return { ok: false, error: "Only the project lead or an admin can edit this project." };
  }

  await db.project.update({
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
    },
  });

  revalidatePath("/projects");
  revalidatePath("/");
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
  revalidatePath("/projects");
  revalidatePath("/");
  return { ok: true };
}
