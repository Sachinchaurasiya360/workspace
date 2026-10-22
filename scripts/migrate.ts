/**
 * One-time migration: legacy/Operation workspace.xlsx -> Postgres (via Prisma).
 *
 * Run with: npx tsx scripts/migrate.ts
 *
 * Design notes (see the approved plan for full rationale):
 * - Runs in dependency order: Users -> Projects -> Tasks -> legacy inline
 *   comments -> Events -> Approvals -> EventOverview -> KpiTargets -> DailyLog.
 * - Required person-fields (Task.assignee, DailyLog.user, EventOverview.user,
 *   Approval.requestedBy) that can't be resolved to a real migrated user
 *   cause that row to be SKIPPED and logged — never guessed or fabricated.
 * - Optional person-fields (Project.lead, Task.createdBy, Approval.approvedBy)
 *   just come through as null with an informational log entry.
 * - Project/Task -> Project linkage is resolved by exact normalized name
 *   match; on no match the task is still created with `unresolvedProjectName`
 *   set rather than dropped.
 * - Approval -> Task linkage CANNOT use the legacy "Task Row" pointer (it's a
 *   snapshot of the row's position at creation time, and rows have since
 *   shifted — verified against this exact file). Matched by exact
 *   normalized Task Description text instead, which is stable.
 * - Approval/EventOverview -> Event linkage resolves against the Events
 *   catalog by exact normalized name; if genuinely absent (personal finds
 *   not in the shared catalog), a new Event row is auto-created from the
 *   referencing row's own fields rather than dropping the relationship.
 * - Every phase appends issues to `report`, dumped to JSON at the end.
 */
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  AccessLevel,
  ApprovalStatus,
  ApprovalType,
  CommentEntityType,
  KpiMetric,
  PrismaClient,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";

const LEGACY_XLSX_PATH = path.resolve(__dirname, "../legacy/Operation workspace.xlsx");
const OUTPUT_DIR = path.resolve(__dirname, "migration-output");

// Neon's pooled endpoint (hostname has "-pooler") terminates connections
// under sustained sequential-query load — use the direct/unpooled endpoint
// for this long-running batch script instead (Neon's own recommendation).
const migrationConnectionString = (process.env.DATABASE_URL ?? "").replace("-pooler", "");
const adapter = new PrismaPg({
  connectionString: migrationConnectionString,
  keepAlive: true,
  max: 1,
  idleTimeoutMillis: 0,
});
const db = new PrismaClient({ adapter });

type ReportEntry = { sheet: string; row: string | number; issue: string };
const report: ReportEntry[] = [];
function logIssue(sheet: string, row: string | number, issue: string) {
  report.push({ sheet, row, issue });
}

// ---------------------------------------------------------------------------
// Workbook reading
// ---------------------------------------------------------------------------

function readSheetRows(workbook: XLSX.WorkBook, sheetName: string): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet not found in workbook: ${sheetName}`);

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });
  const [headerRow, ...dataRows] = raw;
  const headers = (headerRow ?? []).map((h) => (typeof h === "string" ? h.trim() : h));

  return dataRows
    .map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (typeof h === "string" && h) obj[h] = row[i] ?? null;
      });
      return obj;
    })
    .filter((obj) => Object.values(obj).some((v) => v !== null && v !== ""));
}

// ---------------------------------------------------------------------------
// Generic normalization helpers
// ---------------------------------------------------------------------------

function normalizeKey(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().replace(/\s+/g, " ");
  return str.length ? str.toLowerCase() : null;
}

function asTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Best-effort parse of the Events sheet's messy free-text Date column. */
function parseEventDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value !== "string") return null;
  // Matches "14-Aug-2026", "22-23-Aug-2026" (takes the first day), "17-19-Nov-2026", etc.
  const match = value.match(/(\d{1,2})(?:-\d{1,2})?-([A-Za-z]{3,9})-(\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const parsed = new Date(`${day}-${month}-${year}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventTimeToString(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return asTrimmedString(value);
}

// ---------------------------------------------------------------------------
// Enum mappers
// ---------------------------------------------------------------------------

function mapAccessLevel(raw: unknown, rowRef: string | number): AccessLevel {
  const key = normalizeKey(raw) ?? "";
  const hasAdmin = key.includes("admin");
  const hasSales = key.includes("sales");
  const hasTask = key.includes("task");
  if (hasAdmin && hasTask) return AccessLevel.ADMIN_TASK_BASED;
  if (hasAdmin) return AccessLevel.ADMIN;
  if (hasSales && hasTask) return AccessLevel.SALES_TASK_BASED;
  if (hasSales) return AccessLevel.SALES_BASED;
  if (hasTask) return AccessLevel.TASK_BASED;
  logIssue("Team Role", rowRef, `Unrecognized Access value "${raw}" — defaulted to TASK_BASED`);
  return AccessLevel.TASK_BASED;
}

function mapTaskStatus(raw: unknown, rowRef: string | number): TaskStatus {
  switch (normalizeKey(raw)) {
    case "to do":
      return TaskStatus.TODO;
    case "in progress":
      return TaskStatus.IN_PROGRESS;
    case "review":
      return TaskStatus.REVIEW;
    case "pending approval":
      return TaskStatus.PENDING_APPROVAL;
    case "completed":
      return TaskStatus.COMPLETED;
    default:
      logIssue("Task Mastersheet", rowRef, `Unrecognized Status "${raw}" — defaulted to TODO`);
      return TaskStatus.TODO;
  }
}

function mapTaskPriority(raw: unknown): TaskPriority {
  switch (normalizeKey(raw)) {
    case "low":
      return TaskPriority.LOW;
    case "high":
      return TaskPriority.HIGH;
    default:
      return TaskPriority.MEDIUM;
  }
}

function mapProjectStatus(raw: unknown, rowRef: string | number): ProjectStatus {
  switch (normalizeKey(raw)) {
    case "not started":
      return ProjectStatus.NOT_STARTED;
    case "in progress":
      return ProjectStatus.IN_PROGRESS;
    case "on hold":
      return ProjectStatus.ON_HOLD;
    case "completed":
      return ProjectStatus.COMPLETED;
    default:
      logIssue("Project Master sheet", rowRef, `Unrecognized Overall Status "${raw}" — defaulted to NOT_STARTED`);
      return ProjectStatus.NOT_STARTED;
  }
}

/** The legacy sheet had one status column; it now maps onto participation or execution. */
function mapEventOverviewStatus(
  raw: unknown,
  rowRef: string | number
): { participation?: "REGISTERED" | "ATTENDED"; execution?: "IN_PLAN" | "CONDUCTED"; attendedAt?: Date; conductedAt?: Date } {
  switch (normalizeKey(raw)) {
    case "in plan":
      return { execution: "IN_PLAN" };
    case "registered":
      return { participation: "REGISTERED" };
    case "attended":
      return { participation: "ATTENDED", attendedAt: new Date() };
    case "conducted":
      return { execution: "CONDUCTED", conductedAt: new Date() };
    default:
      logIssue("Event Overview", rowRef, `Unrecognized Status "${raw}" — defaulted to In plan`);
      return { execution: "IN_PLAN" };
  }
}

function mapApprovalStatus(raw: unknown, rowRef: string | number): ApprovalStatus {
  switch (normalizeKey(raw)) {
    case "request raised":
      return ApprovalStatus.REQUEST_RAISED;
    case "approved":
      return ApprovalStatus.APPROVED;
    case "rejected":
      return ApprovalStatus.REJECTED;
    case "discuss":
      return ApprovalStatus.DISCUSS;
    default:
      logIssue("Approvals", rowRef, `Unrecognized Status "${raw}" — defaulted to REQUEST_RAISED`);
      return ApprovalStatus.REQUEST_RAISED;
  }
}

function normalizeTargetMonth(raw: unknown): string | null {
  if (raw instanceof Date) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, "0")}`;
  }
  const str = asTrimmedString(raw);
  if (!str) return null;
  const monthIndex = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ].indexOf(str.toLowerCase());
  if (monthIndex >= 0) {
    return `${new Date().getFullYear()}-${String(monthIndex + 1).padStart(2, "0")}`;
  }
  return str;
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

type UserRecord = { id: string; name: string; email: string };

async function main() {
  if (!fs.existsSync(LEGACY_XLSX_PATH)) {
    throw new Error(`Legacy workbook not found at ${LEGACY_XLSX_PATH}`);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const workbook = XLSX.readFile(LEGACY_XLSX_PATH, { cellDates: true });

  const byName = new Map<string, UserRecord>();
  const byEmail = new Map<string, UserRecord>();
  function resolveUser(raw: unknown): UserRecord | null {
    const str = asTrimmedString(raw);
    if (!str) return null;
    if (str.includes("@")) {
      const u = byEmail.get(str.toLowerCase());
      if (u) return u;
    }
    const key = normalizeKey(str);
    if (!key) return null;
    return byName.get(key) ?? null;
  }

  // -------------------------------------------------------------------
  // 1. Users (Team Role)
  // -------------------------------------------------------------------
  const teamRoleRows = readSheetRows(workbook, "Team Role");
  const credentialLines: string[] = ["name,email,temporary_password"];

  for (let i = 0; i < teamRoleRows.length; i++) {
    const row = teamRoleRows[i];
    const rowRef = `Team Role row ${i + 2}`;
    const name = asTrimmedString(row["Name"]);
    const email = asTrimmedString(row["E-mail"])?.toLowerCase();
    if (!name || !email) {
      logIssue("Team Role", rowRef, `Missing name or email — row skipped`);
      continue;
    }

    const tempPassword = `nucleo-${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const role = asTrimmedString(row["Role"]) ?? "Team Member";
    const isFounder = /founder|co-founder|cofounder/i.test(role);
    const access = mapAccessLevel(row["Access"], rowRef);
    const notes = asTrimmedString(row["Notes"]);

    const user = await db.user.upsert({
      where: { email },
      update: { name, role, isFounder, access, notes, passwordHash, mustChangePassword: true },
      create: { name, email, role, isFounder, access, notes, passwordHash, mustChangePassword: true },
    });

    byName.set(normalizeKey(name)!, user);
    byEmail.set(email, user);
    credentialLines.push(`${name},${email},${tempPassword}`);
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, "credentials.csv"), credentialLines.join("\n"));
  console.log(`Users: ${byEmail.size} migrated.`);

  // -------------------------------------------------------------------
  // 2. Projects (Project Master sheet)
  // -------------------------------------------------------------------
  const projectRows = readSheetRows(workbook, "Project Master sheet");
  const projectByKey = new Map<string, { id: string }>();

  for (let i = 0; i < projectRows.length; i++) {
    const row = projectRows[i];
    const legacyRow = i + 2;
    const rowRef = `Project Master sheet row ${legacyRow}`;
    const name = asTrimmedString(row["Project Name"]);
    if (!name) {
      logIssue("Project Master sheet", rowRef, "Missing Project Name — row skipped");
      continue;
    }

    const projectCode = asTrimmedString(row["Project ID"]) ?? `PRJ-LEGACY-${legacyRow}`;
    const lead = resolveUser(row["Lead"]);
    if (row["Lead"] && !lead) {
      logIssue("Project Master sheet", rowRef, `Lead "${row["Lead"]}" not found among migrated users — left unassigned`);
    }
    const createdBy = resolveUser(row["Created By"]);

    const existing = await db.project.findUnique({ where: { projectCode } });
    const project = existing
      ? await db.project.update({
          where: { projectCode },
          data: {
            name,
            department: asTrimmedString(row["Department / Workstream"]),
            leadId: lead?.id ?? null,
            overallStatus: mapProjectStatus(row["Overall Status"], rowRef),
            targetMonth: normalizeTargetMonth(row["Target Month"]),
            startDate: asDate(row["Start Date"]),
            dueDate: asDate(row["Due Date"]),
            notes: asTrimmedString(row["Notes"]),
            createdById: createdBy?.id ?? null,
            legacyRowRef: legacyRow,
          },
        })
      : await db.project.create({
          data: {
            projectCode,
            name,
            department: asTrimmedString(row["Department / Workstream"]),
            leadId: lead?.id ?? null,
            overallStatus: mapProjectStatus(row["Overall Status"], rowRef),
            targetMonth: normalizeTargetMonth(row["Target Month"]),
            startDate: asDate(row["Start Date"]),
            dueDate: asDate(row["Due Date"]),
            notes: asTrimmedString(row["Notes"]),
            createdById: createdBy?.id ?? null,
            legacyRowRef: legacyRow,
          },
        });

    projectByKey.set(normalizeKey(name)!, project);
  }
  console.log(`Projects: ${projectByKey.size} migrated.`);

  // -------------------------------------------------------------------
  // 3. Tasks (Task Mastersheet)
  // -------------------------------------------------------------------
  const taskRows = readSheetRows(workbook, "Task Mastersheet");
  const taskByDescriptionKey = new Map<string, { id: string }[]>();
  let taskCount = 0;

  for (let i = 0; i < taskRows.length; i++) {
    const row = taskRows[i];
    const legacyRow = i + 2;
    const rowRef = `Task Mastersheet row ${legacyRow}`;
    const title = asTrimmedString(row["Task Description"]);
    if (!title) {
      logIssue("Task Mastersheet", rowRef, "Missing Task Description — row skipped");
      continue;
    }

    const assignee = resolveUser(row["Assignee"]);
    if (!assignee) {
      logIssue(
        "Task Mastersheet",
        rowRef,
        `Assignee "${row["Assignee"]}" not found among migrated users — task skipped`
      );
      continue;
    }

    let projectId: string | null = null;
    let unresolvedProjectName: string | null = null;
    const linkedProjectName = asTrimmedString(row["Linked Project Name"]);
    if (linkedProjectName) {
      const project = projectByKey.get(normalizeKey(linkedProjectName)!);
      if (project) {
        projectId = project.id;
      } else {
        unresolvedProjectName = linkedProjectName;
        logIssue("Task Mastersheet", rowRef, `Linked Project "${linkedProjectName}" not found — kept as unresolvedProjectName`);
      }
    }

    const createdBy = resolveUser(row["Created By"]);

    const existing = await db.task.findFirst({ where: { legacyRowRef: legacyRow } });
    const data = {
      title,
      description: asTrimmedString(row["Description"]),
      projectId,
      unresolvedProjectName,
      assigneeId: assignee.id,
      status: mapTaskStatus(row["Status"], rowRef),
      priority: mapTaskPriority(row["Priority"]),
      dueDate: asDate(row["Due Date"]),
      createdById: createdBy?.id ?? null,
      legacyRowRef: legacyRow,
    };
    const task = existing
      ? await db.task.update({ where: { id: existing.id }, data })
      : await db.task.create({ data });

    const key = normalizeKey(title)!;
    taskByDescriptionKey.set(key, [...(taskByDescriptionKey.get(key) ?? []), task]);
    taskCount++;
  }
  console.log(`Tasks: ${taskCount} migrated.`);

  function resolveTaskByDescription(description: unknown, rowRef: string, sheet: string) {
    const key = normalizeKey(description);
    if (!key) return null;
    const candidates = taskByDescriptionKey.get(key);
    if (!candidates || candidates.length === 0) return null;
    if (candidates.length > 1) {
      logIssue(sheet, rowRef, `Multiple tasks share description "${description}" — used the most recently migrated one`);
    }
    return candidates[candidates.length - 1];
  }

  // -------------------------------------------------------------------
  // 4. Legacy inline task comments (parsed out of "Approval / Notes")
  // -------------------------------------------------------------------
  let flattenedComments = 0;
  for (let i = 0; i < taskRows.length; i++) {
    const row = taskRows[i];
    const legacyRow = i + 2;
    const notes = asTrimmedString(row["Approval / Notes"]);
    if (!notes) continue;

    // Expected legacy format per line: "[timestamp · author] comment text"
    const lines = notes.split("\n");
    for (const line of lines) {
      const bracketMatch = line.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
      if (!bracketMatch) continue; // e.g. plain "Added from Daily Update" markers — nothing to flatten
      const [, meta, body] = bracketMatch;
      const metaMatch = meta.match(/^(.*?)\s*·\s*(.*)$/);
      if (!metaMatch || !body.trim()) continue;
      const [, timestampRaw, authorRaw] = metaMatch;

      const task = taskByDescriptionKey.get(normalizeKey(row["Task Description"]) ?? "")?.at(-1);
      if (!task) continue;
      const author = resolveUser(authorRaw);
      if (!author) {
        logIssue("Task Mastersheet", `row ${legacyRow} (inline comment)`, `Comment author "${authorRaw}" not found — comment skipped`);
        continue;
      }

      await db.comment.create({
        data: {
          entityType: CommentEntityType.TASK,
          taskId: task.id,
          userId: author.id,
          body: body.trim(),
          isLegacyImport: true,
          createdAt: asDate(timestampRaw) ?? new Date(),
        },
      });
      flattenedComments++;
    }
  }
  console.log(`Legacy inline comments flattened: ${flattenedComments}.`);

  // -------------------------------------------------------------------
  // 5. Events (catalog)
  // -------------------------------------------------------------------
  const eventRows = readSheetRows(workbook, "Events");
  const eventByKey = new Map<string, { id: string }>();

  for (let i = 0; i < eventRows.length; i++) {
    const row = eventRows[i];
    const legacyRow = i + 2;
    const name = asTrimmedString(row["Event Name"]);
    if (!name) continue;

    const existing = await db.event.findFirst({ where: { legacyRowRef: legacyRow } });
    const data = {
      city: asTrimmedString(row["City"]),
      name,
      date: parseEventDate(row["Date"]),
      time: eventTimeToString(row["Time"]),
      venue: asTrimmedString(row["Venue"]),
      registrationStatus: asTrimmedString(row["Registration"]),
      registrationDeadline: parseEventDate(row["Registration Deadline"]),
      targetAudience: asTrimmedString(row["Target Audience"]),
      keyHighlights: asTrimmedString(row["Key Highlights"]),
      price: asTrimmedString(row["Price"]),
      link: asTrimmedString(row["Link"]),
      legacyRowRef: legacyRow,
    };
    const event = existing
      ? await db.event.update({ where: { id: existing.id }, data })
      : await db.event.create({ data });

    eventByKey.set(normalizeKey(name)!, event);
  }
  console.log(`Events: ${eventByKey.size} migrated.`);

  async function resolveOrCreateEvent(
    name: unknown,
    extra: { city?: unknown; date?: unknown; link?: unknown },
    sheet: string,
    rowRef: string
  ) {
    const key = normalizeKey(name);
    if (!key) return null;
    const existing = eventByKey.get(key);
    if (existing) return existing;

    const created = await db.event.create({
      data: {
        name: asTrimmedString(name)!,
        city: asTrimmedString(extra.city),
        date: asDate(extra.date),
        link: asTrimmedString(extra.link),
      },
    });
    eventByKey.set(key, created);
    logIssue(sheet, rowRef, `Event "${name}" not found in Events catalog — auto-created from this row`);
    return created;
  }

  // -------------------------------------------------------------------
  // 6. Approvals
  // -------------------------------------------------------------------
  const approvalRows = readSheetRows(workbook, "Approvals");
  const seenApprovalIds = new Set<string>();
  let approvalCount = 0;

  for (let i = 0; i < approvalRows.length; i++) {
    const row = approvalRows[i];
    const legacyRow = i + 2;
    const rowRef = `Approvals row ${legacyRow}`;
    const approvalId = asTrimmedString(row["Approval ID"]);
    if (approvalId) {
      if (seenApprovalIds.has(approvalId)) {
        logIssue("Approvals", rowRef, `Duplicate Approval ID "${approvalId}" — row skipped`);
        continue;
      }
      seenApprovalIds.add(approvalId);
    }

    const requestedBy = resolveUser(row["Requested By"]);
    if (!requestedBy) {
      logIssue("Approvals", rowRef, `Requested By "${row["Requested By"]}" not found among migrated users — approval skipped`);
      continue;
    }

    const isTaskApproval = normalizeKey(row["Request Type"]) === "task" || Boolean(row["Task ID"]);
    const approvedBy = resolveUser(row["Approved By"]);
    if (row["Approved By"] && !approvedBy) {
      logIssue("Approvals", rowRef, `Approved By "${row["Approved By"]}" not found — left unassigned`);
    }

    let taskId: string | null = null;
    let eventId: string | null = null;
    let comment = asTrimmedString(row["Comment"]);

    if (isTaskApproval) {
      const task = resolveTaskByDescription(row["Task Description"], rowRef, "Approvals");
      if (task) {
        taskId = task.id;
      } else {
        const note = `[Unresolved legacy task: "${row["Task Description"] ?? "unknown"}"]`;
        comment = comment ? `${note} ${comment}` : note;
        logIssue("Approvals", rowRef, `Referenced task ("${row["Task Description"]}") not found among migrated tasks — kept as a note`);
      }
    } else {
      const event = await resolveOrCreateEvent(row["Event Name"], {}, "Approvals", rowRef);
      eventId = event?.id ?? null;
    }

    await db.approval.create({
      data: {
        type: isTaskApproval ? ApprovalType.TASK_COMPLETION : ApprovalType.EVENT_ATTENDANCE,
        status: mapApprovalStatus(row["Status"], rowRef),
        requestedById: requestedBy.id,
        approvedById: approvedBy?.id ?? null,
        comment,
        taskId,
        eventId,
      },
    });
    approvalCount++;
  }
  console.log(`Approvals: ${approvalCount} migrated.`);

  // -------------------------------------------------------------------
  // 7. Event Overview
  // -------------------------------------------------------------------
  const eventOverviewRows = readSheetRows(workbook, "Event Overview");
  let eventOverviewCount = 0;

  for (let i = 0; i < eventOverviewRows.length; i++) {
    const row = eventOverviewRows[i];
    const legacyRow = i + 2;
    const rowRef = `Event Overview row ${legacyRow}`;

    const user = resolveUser(row["Team Member"]);
    if (!user) {
      logIssue("Event Overview", rowRef, `Team Member "${row["Team Member"]}" not found among migrated users — row skipped`);
      continue;
    }

    const event = await resolveOrCreateEvent(
      row["Event Name"],
      { city: row["City"], date: row["Date"], link: row["Link"] },
      "Event Overview",
      rowRef
    );
    if (!event) {
      logIssue("Event Overview", rowRef, "Missing Event Name — row skipped");
      continue;
    }

    await db.eventOverview.upsert({
      where: { userId_eventId: { userId: user.id, eventId: event.id } },
      update: mapEventOverviewStatus(row["Status"], rowRef),
      create: {
        userId: user.id,
        eventId: event.id,
        ...mapEventOverviewStatus(row["Status"], rowRef),
      },
    });
    eventOverviewCount++;
  }
  console.log(`Event Overview: ${eventOverviewCount} migrated.`);

  // -------------------------------------------------------------------
  // 8. KPI Targets
  // -------------------------------------------------------------------
  const KPI_LOOKUP: Record<string, KpiMetric> = {
    calls: KpiMetric.CALLS,
    discovery: KpiMetric.DISCOVERY,
    profiles: KpiMetric.PROFILES,
    "follow-ups": KpiMetric.FOLLOW_UPS,
    "follow ups": KpiMetric.FOLLOW_UPS,
    "deals closed": KpiMetric.DEALS_CLOSED,
    "events attended": KpiMetric.EVENTS_ATTENDED,
    "events conducted": KpiMetric.EVENTS_CONDUCTED,
    "tasks completed": KpiMetric.TASKS_COMPLETED,
  };
  const kpiTargetRows = readSheetRows(workbook, "KPI Targets");
  let kpiTargetCount = 0;

  for (let i = 0; i < kpiTargetRows.length; i++) {
    const row = kpiTargetRows[i];
    const legacyRow = i + 2;
    const rowRef = `KPI Targets row ${legacyRow}`;

    const user = resolveUser(row["Team Member"]);
    if (!user) {
      logIssue("KPI Targets", rowRef, `Team Member "${row["Team Member"]}" not found — row skipped`);
      continue;
    }
    const kpiKey = normalizeKey(row["KPI"]) ?? "";
    const kpi = KPI_LOOKUP[kpiKey];
    if (!kpi) {
      logIssue("KPI Targets", rowRef, `Unrecognized KPI label "${row["KPI"]}" — row skipped`);
      continue;
    }
    const period = asTrimmedString(row["Period"]) ?? "unknown";

    await db.kpiTarget.upsert({
      where: { userId_kpi_period: { userId: user.id, kpi, period } },
      update: { target: asNumber(row["Target"]), weight: row["Weight"] ? Number(row["Weight"]) : null },
      create: {
        userId: user.id,
        kpi,
        period,
        target: asNumber(row["Target"]),
        weight: row["Weight"] ? Number(row["Weight"]) : null,
      },
    });
    kpiTargetCount++;
  }
  console.log(`KPI Targets: ${kpiTargetCount} migrated.`);

  // -------------------------------------------------------------------
  // 9. Daily Logs (append-only)
  // -------------------------------------------------------------------
  const dailyLogRows = readSheetRows(workbook, "Daily logs");
  let dailyLogCount = 0;

  for (let i = 0; i < dailyLogRows.length; i++) {
    const row = dailyLogRows[i];
    const legacyRow = i + 2;
    const rowRef = `Daily logs row ${legacyRow}`;

    const user = resolveUser(row["Team Member"]);
    if (!user) {
      logIssue("Daily logs", rowRef, `Team Member "${row["Team Member"]}" not found among migrated users — row skipped`);
      continue;
    }

    await db.dailyLog.create({
      data: {
        userId: user.id,
        callsMade: asNumber(row["Calls Made"]),
        followUps: asNumber(row["Follow-ups"]),
        dealsClosed: asNumber(row["Deals Closed"]),
        meetings: asNumber(row["Meetings"]),
        outboundReach: asNumber(row["Outbound Reach"]),
        discoveryDemos: asNumber(row["Discovery & Demos"]),
        profilesSignups: asNumber(row["Profiles & Signups"]),
        activitiesHtml: asTrimmedString(row["Activities Done"]),
        createdAt: asDate(row["Timestamp"]) ?? new Date(),
      },
    });
    dailyLogCount++;
  }
  console.log(`Daily logs: ${dailyLogCount} migrated.`);

  // -------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------
  fs.writeFileSync(path.join(OUTPUT_DIR, "migration-report.json"), JSON.stringify(report, null, 2));
  console.log(`\n${report.length} issues logged to scripts/migration-output/migration-report.json`);
  console.log(`Temporary passwords written to scripts/migration-output/credentials.csv (not committed).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
