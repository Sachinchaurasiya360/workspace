import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";

import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TASK_TABLE_COLS, TaskRow } from "@/components/tasks/task-row";
import { Button } from "@/components/ui/button";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { addDays, startOfToday } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { loadTaskFormOptions, loadTaskRows } from "@/lib/task-data";
import { PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-constants";
import { visibleTasksWhere } from "@/lib/visibility";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const SELECT_CLASS =
  "h-10 rounded-[10px] border border-input bg-card px-2.5 text-[13px] text-secondary-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20";

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;

  const q = one(params.q).trim();
  const status = one(params.status) as TaskStatus | "";
  const priority = one(params.priority) as TaskPriority | "";
  const assignee = one(params.assignee);
  const projectId = one(params.project);
  const due = one(params.due);
  // Non-admins default to their own tasks; "scope=all" widens to everything they can see.
  const scope = isAdmin ? "all" : one(params.scope) === "all" ? "all" : "mine";

  const today = startOfToday();
  const filters: Prisma.TaskWhereInput[] = [visibleTasksWhere(user)];
  if (scope === "mine") filters.push({ assigneeId: user.id });
  if (q) filters.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  if (TASK_STATUSES.includes(status as TaskStatus)) filters.push({ status: status as TaskStatus });
  else if (!status) filters.push({ status: { not: "COMPLETED" } });
  if (priority && priority in PRIORITY_LABEL) filters.push({ priority });
  if (assignee && isAdmin) filters.push({ assigneeId: assignee });
  if (projectId) filters.push({ projectId: projectId === "none" ? null : projectId });
  if (due === "overdue") filters.push({ dueDate: { lt: today }, status: { not: "COMPLETED" } });
  if (due === "week") filters.push({ dueDate: { gte: today, lt: addDays(today, 7) } });
  if (due === "none") filters.push({ dueDate: null });

  const base: Prisma.TaskWhereInput = scope === "mine" ? { assigneeId: user.id } : visibleTasksWhere(user);
  const [{ rows, commentsFor, historyFor }, options, counts] = await Promise.all([
    loadTaskRows(user, { AND: filters }),
    loadTaskFormOptions(user),
    Promise.all([
      db.task.count({ where: { AND: [base, { status: { not: "COMPLETED" } }] } }),
      db.task.count({ where: { AND: [base, { status: { not: "COMPLETED" }, dueDate: { lt: today } }] } }),
      db.task.count({ where: { AND: [base, { status: { not: "COMPLETED" }, dueDate: { gte: today, lt: addDays(today, 7) } }] } }),
      db.task.count({ where: { AND: [base, { status: "PENDING_APPROVAL" }] } }),
    ]),
  ]);
  const [openCount, overdueCount, weekCount, pendingCount] = counts;
  const activeFilters = [q, status, priority, assignee, projectId, due].some(Boolean);
  const scopeQs = scope === "all" && !isAdmin ? "&scope=all" : "";
  const showAssignee = scope === "all";

  // Quick-filter chips (same links the old stat tiles used). Highlight the one matching the URL exactly.
  const onlyFilter = (key: string, value: string) =>
    [q, status, priority, assignee, projectId, due].filter(Boolean).length === (value ? 1 : 0) &&
    (value ? params[key] === value : true);
  const chips = [
    { label: "Open", count: openCount, href: `/tasks?${scopeQs}`, active: onlyFilter("", ""), warn: false },
    { label: "Overdue", count: overdueCount, href: `/tasks?due=overdue${scopeQs}`, active: onlyFilter("due", "overdue"), warn: overdueCount > 0 },
    { label: "Due in 7 days", count: weekCount, href: `/tasks?due=week${scopeQs}`, active: onlyFilter("due", "week"), warn: false },
    {
      label: "Awaiting approval",
      count: pendingCount,
      href: `/tasks?status=PENDING_APPROVAL${scopeQs}`,
      active: onlyFilter("status", "PENDING_APPROVAL"),
      warn: false,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {openCount} open · {overdueCount} overdue
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">{isAdmin ? "All tasks" : "My tasks"}</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Every task across the organisation." : "Tasks assigned to you."}
          </p>
        </div>
        <TaskFormDialog
          mode="create"
          projects={options.projects}
          members={options.members}
          trigger={
            <Button size="lg">
              <Plus /> New task
            </Button>
          }
        />
      </div>

      <nav aria-label="Quick filters" className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            aria-current={c.active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[13px] transition-colors",
              c.active
                ? "border-foreground bg-foreground font-semibold text-background"
                : c.warn
                  ? "border-[#EFD9A8] bg-warning-soft font-semibold text-[#7A4B00] hover:bg-[#F7E7C4]"
                  : "border-input bg-card font-medium text-secondary-foreground hover:bg-muted"
            )}
          >
            {c.label}
            <span className="font-mono text-xs opacity-75">{c.count}</span>
          </Link>
        ))}
      </nav>

      <form className="flex flex-wrap items-center gap-2" action="/tasks">
        {!isAdmin && (
          <select name="scope" defaultValue={scope} className={SELECT_CLASS} aria-label="Scope">
            <option value="mine">Assigned to me</option>
            <option value="all">Everything I can see</option>
          </select>
        )}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search tasks…"
          className={`${SELECT_CLASS} w-full min-w-40 flex-1 px-3 sm:w-auto`}
        />
        <select name="status" defaultValue={status} className={SELECT_CLASS} aria-label="Status">
          <option value="">Open (not completed)</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select name="priority" defaultValue={priority} className={SELECT_CLASS} aria-label="Priority">
          <option value="">Any priority</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {isAdmin && options.members && (
          <select name="assignee" defaultValue={assignee} className={SELECT_CLASS} aria-label="Assignee">
            <option value="">Anyone</option>
            {options.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <select name="project" defaultValue={projectId} className={SELECT_CLASS} aria-label="Project">
          <option value="">Any project</option>
          <option value="none">No project</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="due" defaultValue={due} className={SELECT_CLASS} aria-label="Due">
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </select>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {activeFilters && (
          <Button asChild variant="ghost">
            <Link href={scope === "all" && !isAdmin ? "/tasks?scope=all" : "/tasks"}>Clear</Link>
          </Button>
        )}
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div
          className={cn(
            "hidden h-11 items-center gap-4 border-b border-border bg-[#FBFAF7] px-5 text-xs font-semibold text-muted-foreground lg:grid",
            showAssignee ? TASK_TABLE_COLS.withAssignee : TASK_TABLE_COLS.withoutAssignee
          )}
        >
          <span>Task</span>
          <span>Project</span>
          {showAssignee && <span>Assignee</span>}
          <span>Status</span>
          <span>Priority</span>
          <span>Due</span>
          <span className="text-right">Notes</span>
        </div>
        {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No tasks match these filters.</p>}
        {rows.map((t) => (
          <TaskRow
            key={t.id}
            variant="table"
            task={t}
            comments={commentsFor(t.id)}
            history={historyFor(t.id)}
            projects={options.projects}
            members={options.members}
            currentUser={user}
            showAssignee={showAssignee}
          />
        ))}
        <div className="flex h-[52px] items-center px-5 text-[13px] text-muted-foreground">
          Showing {rows.length} task{rows.length === 1 ? "" : "s"}
          {rows.length === 200 ? " (first 200 — narrow the filters)" : ""}
        </div>
      </div>
    </div>
  );
}
