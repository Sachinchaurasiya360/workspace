"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { assertIsAdmin } from "@/lib/access";
import { ASSIGNABLE_ACCESS } from "@/lib/access-labels";
import { logActivity } from "@/lib/audit";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { AccessLevel } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

/** Result carrying the one-time password to hand to the member. */
export type TempPasswordResult = { ok: true; tempPassword: string } | { ok: false; error: string };

function generateTempPassword() {
  return `nucleo-${randomBytes(6).toString("base64url")}`;
}

const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d][\d\s()-]*$/, "Enter a valid phone number")
  .optional()
  .nullable()
  .or(z.literal(""));

const memberInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
  role: z.string().trim().min(1, "Role is required"),
  phone,
  access: z.nativeEnum(AccessLevel).default(AccessLevel.TASK_BASED),
  isFounder: z.boolean().default(false),
});

const RETIRED_ACCESS_ERROR = "Combined access levels are no longer available. Pick a single access type.";

async function requireAdmin(message: string) {
  const user = await requireUser();
  assertIsAdmin(user, message);
  return user;
}

/**
 * No email provider is configured yet, so the temporary password is
 * returned once to the admin to share. It's never stored in plain text;
 * the member must change it on first login.
 */
export async function addTeamMember(raw: unknown): Promise<TempPasswordResult> {
  let user;
  try {
    user = await requireAdmin("Only an admin can add team members.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = memberInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;
  if (!ASSIGNABLE_ACCESS.has(data.access)) return { ok: false, error: RETIRED_ACCESS_ERROR };

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return { ok: false, error: "A user with this email already exists." };

  const tempPassword = generateTempPassword();
  const created = await db.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      role: data.role,
      phone: data.phone || null,
      access: data.access,
      isFounder: data.isFounder,
      passwordHash: await bcrypt.hash(tempPassword, 12),
      mustChangePassword: true,
    },
  });

  await logActivity(user.id, "member.added", "USER", created.id, { label: created.name });
  revalidatePath("/team");
  return { ok: true, tempPassword };
}

const updateMemberSchema = memberInputSchema.omit({ email: true }).extend({
  id: z.string(),
  isActive: z.boolean(),
});

export async function updateTeamMember(raw: unknown): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin("Only an admin can edit team members.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = updateMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { id, ...data } = parsed.data;

  const target = await db.user.findUnique({ where: { id }, select: { isFounder: true, access: true } });
  if (!target) return { ok: false, error: "Member not found." };
  // A member already on a retired combined level may keep it, but nobody can be moved onto one.
  if (data.access !== target.access && !ASSIGNABLE_ACCESS.has(data.access)) {
    return { ok: false, error: RETIRED_ACCESS_ERROR };
  }

  if (id === user.id && (!data.isActive || (data.access !== user.access && !user.isFounder))) {
    return { ok: false, error: "You can't deactivate yourself or change your own access." };
  }
  // Founder status is the root of every permission — only founders manage it.
  if (!user.isFounder && (target.isFounder || data.isFounder)) {
    return { ok: false, error: "Only a founder can edit a founder or grant founder status." };
  }
  if (target.isFounder && (!data.isFounder || !data.isActive)) {
    const otherFounders = await db.user.count({ where: { isFounder: true, isActive: true, id: { not: id } } });
    if (otherFounders === 0) return { ok: false, error: "The workspace needs at least one active founder." };
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      name: data.name,
      role: data.role,
      phone: data.phone || null,
      access: data.access,
      isFounder: data.isFounder,
      isActive: data.isActive,
    },
  });

  await logActivity(user.id, "member.updated", "USER", id, { label: updated.name });
  revalidatePath("/team");
  revalidatePath("/");
  return { ok: true };
}

export async function resetMemberPassword(memberId: string): Promise<TempPasswordResult> {
  let user;
  try {
    user = await requireAdmin("Only an admin can reset passwords.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const target = await db.user.findUnique({ where: { id: memberId }, select: { isFounder: true } });
  if (!target) return { ok: false, error: "Member not found." };
  if (target.isFounder && !user.isFounder) {
    return { ok: false, error: "Only a founder can reset a founder's password." };
  }

  const tempPassword = generateTempPassword();
  const updated = await db.user.update({
    where: { id: memberId },
    // Bumping sessionVersion signs the member out everywhere.
    data: { passwordHash: await bcrypt.hash(tempPassword, 12), mustChangePassword: true, sessionVersion: { increment: 1 } },
  });

  await logActivity(user.id, "member.updated", "USER", memberId, { label: updated.name, change: "password reset" });
  return { ok: true, tempPassword };
}

const deleteMemberSchema = z.object({
  memberId: z.string(),
  /** Who inherits the member's tasks, leads and led projects. */
  reassignToId: z.string().optional().nullable(),
  /** The member's full name, typed to confirm. */
  confirmName: z.string(),
});

/**
 * Permanently removes a member. Work they own (tasks, leads, projects they
 * lead) moves to `reassignToId`; their comments, approvals and lead
 * activity stay, attributed to "Deleted user"; personal records (daily
 * logs, KPI targets, event participation, notifications) are removed.
 * Deactivating is the reversible alternative.
 */
export async function deleteTeamMember(raw: unknown): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin("Only an admin can delete team members.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = deleteMemberSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { memberId, reassignToId, confirmName } = parsed.data;

  if (memberId === user.id) return { ok: false, error: "You can't delete your own account." };

  const member = await db.user.findUnique({
    where: { id: memberId },
    include: { _count: { select: { tasksAssigned: true, leadsOwned: true, projectsLed: true } } },
  });
  if (!member) return { ok: false, error: "Member not found." };
  if (confirmName.trim() !== member.name) return { ok: false, error: `Type "${member.name}" exactly to confirm.` };

  if (member.isFounder) {
    if (!user.isFounder) return { ok: false, error: "Only a founder can delete another founder." };
    const founders = await db.user.count({ where: { isFounder: true, isActive: true } });
    if (founders <= 1) return { ok: false, error: "You can't delete the last founder." };
  }

  const ownsWork = member._count.tasksAssigned + member._count.leadsOwned + member._count.projectsLed > 0;
  if (ownsWork) {
    if (!reassignToId) return { ok: false, error: "Choose who takes over their tasks, leads and projects." };
    if (reassignToId === memberId) return { ok: false, error: "Pick a different member to take over." };
    const heir = await db.user.findUnique({ where: { id: reassignToId }, select: { isActive: true } });
    if (!heir?.isActive) return { ok: false, error: "The member taking over must be active." };
  }

  await db.$transaction(async (tx) => {
    if (ownsWork && reassignToId) {
      await tx.task.updateMany({ where: { assigneeId: memberId }, data: { assigneeId: reassignToId } });
      await tx.lead.updateMany({ where: { ownerId: memberId }, data: { ownerId: reassignToId } });
      await tx.project.updateMany({ where: { leadId: memberId }, data: { leadId: reassignToId } });
    }
    // Their open event requests can't be acted on any more.
    await tx.approval.updateMany({
      where: { requestedById: memberId, type: "EVENT_ATTENDANCE", status: { in: ["REQUEST_RAISED", "DISCUSS"] } },
      data: { status: "REJECTED", resolvedAt: new Date(), approvedById: user.id, comment: "Requester was removed from the workspace." },
    });
    await tx.user.delete({ where: { id: memberId } });
  });

  await logActivity(user.id, "member.deleted", "USER", memberId, { label: member.name });
  if (ownsWork && reassignToId) {
    await createNotification(
      reassignToId,
      `${user.name} moved ${member.name}'s tasks, leads and projects to you`,
      "/tasks"
    );
  }

  revalidatePath("/team");
  revalidatePath("/", "layout");
  return { ok: true };
}
