"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { assertIsAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AccessLevel } from "@prisma/client";
import type { ActionResult } from "@/actions/tasks";

function generateTempPassword() {
  return `nucleo-${Math.random().toString(36).slice(2, 10)}`;
}

const memberInputSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.string().min(1, "Role is required"),
  access: z.nativeEnum(AccessLevel).default(AccessLevel.TASK_BASED),
  isFounder: z.boolean().default(false),
});

export async function addTeamMember(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    assertIsAdmin(user, "Only an admin can add team members.");
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Forbidden" };
  }

  const parsed = memberInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) return { ok: false, error: "A user with this email already exists." };

  const passwordHash = await bcrypt.hash(generateTempPassword(), 12);
  await db.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      role: data.role,
      access: data.access,
      isFounder: data.isFounder,
      passwordHash,
      mustChangePassword: true,
    },
  });

  revalidatePath("/team");
  return { ok: true };
}
