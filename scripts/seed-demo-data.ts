/**
 * Additive demo-data seed — fills in tables the migration left empty
 * (KpiTarget, Comment, Notification) using the REAL migrated users/tasks/
 * projects/events, so the UI has representative content everywhere.
 * Safe to re-run: KpiTargets upsert, comments/notifications are only
 * inserted if none already exist for that entity.
 *
 * Run with: npx tsx scripts/seed-demo-data.ts
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { AccessLevel, KpiMetric, PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const SALES_TARGETS: { kpi: KpiMetric; target: number }[] = [
  { kpi: KpiMetric.CALLS, target: 150 },
  { kpi: KpiMetric.FOLLOW_UPS, target: 40 },
  { kpi: KpiMetric.DEALS_CLOSED, target: 5 },
  { kpi: KpiMetric.DISCOVERY, target: 10 },
  { kpi: KpiMetric.PROFILES, target: 20 },
];
const TASK_TARGETS: { kpi: KpiMetric; target: number }[] = [
  { kpi: KpiMetric.TASKS_COMPLETED, target: 15 },
  { kpi: KpiMetric.EVENTS_ATTENDED, target: 2 },
];

function targetsForAccess(access: AccessLevel) {
  switch (access) {
    case AccessLevel.SALES_BASED:
    case AccessLevel.ADMIN_SALES_BASED:
      return SALES_TARGETS;
    case AccessLevel.SALES_TASK_BASED:
      return [...SALES_TARGETS, ...TASK_TARGETS];
    case AccessLevel.TASK_BASED:
    case AccessLevel.ENGINEERING:
      return TASK_TARGETS;
    case AccessLevel.ADMIN_TASK_BASED:
      return [...TASK_TARGETS, { kpi: KpiMetric.EVENTS_CONDUCTED, target: 1 }];
    case AccessLevel.ADMIN:
      return [{ kpi: KpiMetric.EVENTS_CONDUCTED, target: 2 }, ...TASK_TARGETS];
  }
}

async function seedKpiTargets() {
  const users = await db.user.findMany({ where: { isActive: true } });
  const period = currentPeriod();
  let count = 0;

  for (const user of users) {
    for (const { kpi, target } of targetsForAccess(user.access)) {
      await db.kpiTarget.upsert({
        where: { userId_kpi_period: { userId: user.id, kpi, period } },
        update: { target },
        create: { userId: user.id, kpi, period, target },
      });
      count++;
    }
  }
  console.log(`KPI targets: ${count} upserted for period ${period}.`);
}

async function seedComments() {
  const [tasks, projects, events, users] = await Promise.all([
    db.task.findMany({ take: 5, include: { assignee: true } }),
    db.project.findMany({ take: 3, include: { lead: true } }),
    db.event.findMany({ take: 3 }),
    db.user.findMany({ where: { isActive: true } }),
  ]);
  const admin = users.find((u) => u.isFounder) ?? users[0];
  let count = 0;

  for (const task of tasks) {
    const existing = await db.comment.count({ where: { entityType: "TASK", taskId: task.id } });
    if (existing > 0) continue;
    await db.comment.create({
      data: {
        entityType: "TASK",
        taskId: task.id,
        userId: admin.id,
        body: "Looping in on this — let me know if you need a hand or any unblocking.",
      },
    });
    count++;
  }

  for (const project of projects) {
    const existing = await db.comment.count({ where: { entityType: "PROJECT", projectId: project.id } });
    if (existing > 0) continue;
    await db.comment.create({
      data: {
        entityType: "PROJECT",
        projectId: project.id,
        userId: project.lead?.id ?? admin.id,
        body: "Good progress here — let's sync on next steps in this week's check-in.",
      },
    });
    count++;
  }

  for (const event of events) {
    const existing = await db.comment.count({ where: { entityType: "EVENT", eventId: event.id } });
    if (existing > 0) continue;
    await db.comment.create({
      data: {
        entityType: "EVENT",
        eventId: event.id,
        userId: admin.id,
        body: "Worth a few of us attending this one — good networking angle.",
      },
    });
    count++;
  }

  console.log(`Comments: ${count} created.`);
}

async function seedNotifications() {
  const users = await db.user.findMany({ where: { isActive: true }, take: 5 });
  let count = 0;

  for (const user of users) {
    const existing = await db.notification.count({ where: { userId: user.id } });
    if (existing > 0) continue;
    await db.notification.create({
      data: {
        userId: user.id,
        message: "Welcome to the new Nucleo workspace — this is where your notifications will show up.",
        link: "/",
      },
    });
    count++;
  }

  console.log(`Notifications: ${count} created.`);
}

async function main() {
  await seedKpiTargets();
  await seedComments();
  await seedNotifications();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
