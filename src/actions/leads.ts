"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertOwnerOrAdmin, canManageAll, hasSalesAccess } from "@/lib/access";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { isValidDateString } from "@/lib/dates";
import { requireUser } from "@/lib/session";
import { canViewProject } from "@/lib/visibility";
import { LeadActivityType, LeadStage } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  company: z.string().trim().optional().nullable(),
  email: z.string().trim().email("Enter a valid email").optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(30).optional().nullable(),
  stage: z.nativeEnum(LeadStage).default(LeadStage.NEW),
  // "" from a cleared input means "no value", not ₹0.
  value: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().min(0).nullable()),
  source: z.string().trim().optional().nullable(),
  nextFollowUp: z.string().refine(isValidDateString, "Enter a valid date").optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
});

type User = Awaited<ReturnType<typeof requireUser>>;

function canUseLeads(user: User) {
  return canManageAll(user) || hasSalesAccess(user);
}

async function isActiveUser(id: string) {
  return !!(await db.user.findFirst({ where: { id, isActive: true }, select: { id: true } }));
}

function revalidateLeadViews(id?: string) {
  revalidatePath("/leads");
  if (id) revalidatePath(`/leads/${id}`);
  revalidatePath("/");
}

function toData(data: z.infer<typeof leadSchema>) {
  return {
    name: data.name,
    company: data.company || null,
    email: data.email || null,
    phone: data.phone || null,
    stage: data.stage,
    value: data.value ?? null,
    source: data.source || null,
    nextFollowUp: data.nextFollowUp ? new Date(data.nextFollowUp) : null,
    notes: data.notes || null,
    projectId: data.projectId || null,
  };
}

/** Leads may only be filed under projects the user can see. */
async function checkProject(user: User, projectId: string | null | undefined) {
  if (!projectId) return null;
  return (await canViewProject(user, projectId)) ? null : "You can't link a lead to that project.";
}

export async function createLead(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!canUseLeads(user)) return { ok: false, error: "Leads are available to sales and admin users." };
  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const projectError = await checkProject(user, parsed.data.projectId);
  if (projectError) return { ok: false, error: projectError };
  const ownerId = parsed.data.ownerId && canManageAll(user) ? parsed.data.ownerId : user.id;
  if (ownerId !== user.id && !(await isActiveUser(ownerId))) return { ok: false, error: "That owner isn't an active member." };
  const lead = await db.lead.create({ data: { ...toData(parsed.data), ownerId } });

  await logActivity(user.id, "lead.created", "LEAD", lead.id, { label: lead.name });
  if (ownerId !== user.id) await createNotification(ownerId, `${user.name} assigned you lead "${lead.name}"`, `/leads/${lead.id}`);
  revalidateLeadViews();
  return { ok: true };
}

export async function updateLead(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!canUseLeads(user)) return { ok: false, error: "Leads are available to sales and admin users." };
  const parsed = leadSchema.extend({ id: z.string() }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, error: "Lead not found" };
  try {
    assertOwnerOrAdmin(user, lead.ownerId, "Only the lead owner or an admin can edit this lead.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  if ((data.projectId || null) !== lead.projectId) {
    const projectError = await checkProject(user, data.projectId);
    if (projectError) return { ok: false, error: projectError };
  }
  const ownerId = data.ownerId && canManageAll(user) ? data.ownerId : lead.ownerId;
  if (ownerId !== lead.ownerId && !(await isActiveUser(ownerId))) return { ok: false, error: "That owner isn't an active member." };
  const updated = await db.lead.update({ where: { id }, data: { ...toData(data), ownerId } });

  await logActivity(user.id, "lead.updated", "LEAD", id, { label: updated.name, from: lead.stage, to: updated.stage });
  if (ownerId !== lead.ownerId && ownerId !== user.id) {
    await createNotification(ownerId, `${user.name} assigned you lead "${updated.name}"`, `/leads/${id}`);
  }
  revalidateLeadViews(id);
  return { ok: true };
}

export async function deleteLead(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canUseLeads(user)) return { ok: false, error: "Leads are available to sales and admin users." };
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, error: "Lead not found" };
  try {
    assertOwnerOrAdmin(user, lead.ownerId, "Only the lead owner or an admin can delete this lead.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }
  await db.lead.delete({ where: { id } });
  revalidateLeadViews();
  return { ok: true };
}

const activitySchema = z.object({
  leadId: z.string(),
  type: z.nativeEnum(LeadActivityType),
  note: z.string().trim().max(4000).optional().nullable(),
});

/** A call / follow-up / meeting / note recorded against a specific lead. */
export async function logLeadActivity(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!canUseLeads(user)) return { ok: false, error: "Leads are available to sales and admin users." };
  const parsed = activitySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { leadId, type, note } = parsed.data;

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found" };
  try {
    assertOwnerOrAdmin(user, lead.ownerId, "Only the lead owner or an admin can log activity on this lead.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  await db.leadActivity.create({ data: { leadId, userId: user.id, type, note: note || null } });
  // A touch moves a brand-new lead forward automatically.
  if (lead.stage === "NEW" && type !== "NOTE") {
    await db.lead.update({ where: { id: leadId }, data: { stage: type === "MEETING" ? "MEETING" : "CONTACTED" } });
  }

  await logActivity(user.id, "lead.activity", "LEAD", leadId, { label: lead.name, activityType: type });
  revalidateLeadViews(leadId);
  return { ok: true };
}
