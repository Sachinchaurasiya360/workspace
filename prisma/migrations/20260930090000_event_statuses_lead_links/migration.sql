-- Split the single event-overview status into two independent tracks
-- (participation vs execution), link leads to projects/tasks, and record
-- events in daily updates. Hand-ordered so existing statuses are copied
-- into the new columns before the old column is dropped.

-- CreateEnum
CREATE TYPE "EventParticipation" AS ENUM ('REGISTERED', 'ATTENDED');

-- CreateEnum
CREATE TYPE "EventExecution" AS ENUM ('IN_PLAN', 'CONDUCTED');

-- AlterTable
ALTER TABLE "EventOverview"
ADD COLUMN     "attendedAt" TIMESTAMP(3),
ADD COLUMN     "conductedAt" TIMESTAMP(3),
ADD COLUMN     "execution" "EventExecution",
ADD COLUMN     "participation" "EventParticipation";

-- Backfill from the old status. The last status change is the best
-- available timestamp for when someone attended / conducted.
UPDATE "EventOverview" SET "participation" = 'REGISTERED' WHERE "status" = 'REGISTERED';
UPDATE "EventOverview" SET "participation" = 'ATTENDED', "attendedAt" = "updatedAt" WHERE "status" = 'ATTENDED';
UPDATE "EventOverview" SET "execution" = 'IN_PLAN' WHERE "status" = 'IN_PLAN';
UPDATE "EventOverview" SET "execution" = 'CONDUCTED', "conductedAt" = "updatedAt" WHERE "status" = 'CONDUCTED';

ALTER TABLE "EventOverview" DROP COLUMN "status";

-- DropEnum
DROP TYPE "EventOverviewStatus";

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "DailyLog" ADD COLUMN     "eventUpdates" JSONB;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "projectId" TEXT;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
