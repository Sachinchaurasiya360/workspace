import { db } from "@/lib/db";
import type { CommentEntityType } from "@prisma/client";

const FIELD_BY_TYPE = {
  TASK: "taskId",
  PROJECT: "projectId",
  EVENT: "eventId",
} as const;

export async function getComments(entityType: CommentEntityType, entityId: string) {
  return db.comment.findMany({
    where: { entityType, [FIELD_BY_TYPE[entityType]]: entityId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getCommentCounts(entityType: CommentEntityType, entityIds: string[]) {
  if (entityIds.length === 0) return new Map<string, number>();
  const field = FIELD_BY_TYPE[entityType];
  const rows = await db.comment.groupBy({
    by: [field],
    where: { entityType, [field]: { in: entityIds } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of rows as unknown as Record<string, unknown>[]) {
    const key = row[field] as string;
    map.set(key, (row._count as { _all: number })._all);
  }
  return map;
}
