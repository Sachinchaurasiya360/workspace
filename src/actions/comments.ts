"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
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
  body: z.string().min(1, "Comment can't be empty"),
});

export async function addComment(raw: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { entityType, entityId, body } = parsed.data;

  await db.comment.create({
    data: {
      entityType,
      [FIELD_BY_TYPE[entityType]]: entityId,
      userId: user.id,
      body,
    },
  });

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/discovery");
  return { ok: true };
}
