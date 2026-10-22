"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { unstable_update } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import type { ActionResult } from "@/actions/tasks";

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^([+\d][\d\s()-]*)?$/, "Enter a valid phone number")
    .optional()
    .nullable(),
});

/** Members edit their own name and contact number; role/access stay admin-managed. */
export async function updateProfile(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  await db.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name, phone: parsed.data.phone || null },
  });
  // Keep the name shown from the session (sidebar) in sync.
  await unstable_update({ name: parsed.data.name } as never);

  revalidatePath("/", "layout");
  return { ok: true };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "New password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must be different from the current one.",
    path: ["newPassword"],
  });

export async function changePassword(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const record = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!record || !(await bcrypt.compare(parsed.data.currentPassword, record.passwordHash))) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
    },
  });
  // Keep this session; sessions on other devices are signed out.
  await unstable_update({ sessionVersion: updated.sessionVersion } as never);
  return { ok: true };
}
