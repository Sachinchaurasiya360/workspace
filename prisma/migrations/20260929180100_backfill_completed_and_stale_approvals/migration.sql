-- Data backfill, kept separate from the enum change above so the new
-- CANCELLED value is committed before it's used.

-- Existing completed tasks: best available completion time is their last update.
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'COMPLETED' AND "completedAt" IS NULL;

-- Completion requests whose task has already moved on (reopened, or completed
-- directly by an admin) can no longer be decided meaningfully.
UPDATE "Approval" a
SET "status" = 'CANCELLED', "resolvedAt" = NOW(), "comment" = COALESCE(a."comment", 'Withdrawn — the task''s status changed before a decision.')
FROM "Task" t
WHERE a."taskId" = t."id"
  AND a."type" = 'TASK_COMPLETION'
  AND a."status" IN ('REQUEST_RAISED', 'DISCUSS')
  AND t."status" <> 'PENDING_APPROVAL';
