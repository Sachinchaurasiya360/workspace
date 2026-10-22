import Link from "next/link";
import { redirect } from "next/navigation";
import { Columns3, LayoutGrid, Plus, Search } from "lucide-react";
import type { Prisma, ProjectStatus } from "@prisma/client";

import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusChip } from "@/components/projects/project-status-chip";
import { Button } from "@/components/ui/button";
import { canManageAll } from "@/lib/access";
import { db } from "@/lib/db";
import { startOfToday } from "@/lib/events";
import { PROJECT_STATUS_LABEL } from "@/lib/project-constants";
import { getProjectProgressMap } from "@/lib/project-progress";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { visibleProjectsWhere } from "@/lib/visibility";
import { formatDate } from "@/lib/format";

const STATUS_TABS: ProjectStatus[] = ["IN_PROGRESS", "NOT_STARTED", "ON_HOLD", "COMPLETED"];
// Board columns follow the project lifecycle, left to right.
const BOARD_COLUMNS: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED"];

type View = "grid" | "board";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" && params.status in PROJECT_STATUS_LABEL ? (params.status as ProjectStatus) : "";
  const view: View = params.view === "board" ? "board" : "grid";
  const isBoard = view === "board";

  const searchWhere: Prisma.ProjectWhereInput = q
    ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { department: { contains: q, mode: "insensitive" } }] }
    : {};
  // The board's columns already split by status, so the status filter only applies to the grid.
  const where: Prisma.ProjectWhereInput = {
    AND: [visibleProjectsWhere(user), searchWhere, status && !isBoard ? { overallStatus: status } : {}],
  };

  const [projects, people, statusCounts] = await Promise.all([
    db.project.findMany({
      where,
      include: { lead: { select: { name: true } }, _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Per-status counts for the tabs (same visibility + search, ignoring the status filter).
    db.project.groupBy({
      by: ["overallStatus"],
      where: { AND: [visibleProjectsWhere(user), searchWhere] },
      _count: { _all: true },
    }),
  ]);
  const progressMap = await getProjectProgressMap(projects.map((p) => p.id));
  const today = startOfToday();

  const countFor = (s: ProjectStatus) => statusCounts.find((c) => c.overallStatus === s)?._count._all ?? 0;
  const totalCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0);
  const buildHref = (s: ProjectStatus | "", v: View) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (s && v === "grid") qs.set("status", s);
    if (v === "board") qs.set("view", "board");
    const str = qs.toString();
    return str ? `/projects?${str}` : "/projects";
  };
  const tabs: { value: ProjectStatus | ""; label: string; count: number }[] = [
    { value: "", label: "All", count: totalCount },
    ...STATUS_TABS.map((s) => ({ value: s, label: PROJECT_STATUS_LABEL[s], count: countFor(s) })),
  ];
  const views = [
    { value: "grid" as const, label: "Grid", icon: LayoutGrid },
    { value: "board" as const, label: "Board", icon: Columns3 },
  ];
  const cardProps = (p: (typeof projects)[number]) => ({
    project: p,
    progress: progressMap.get(p.id)!,
    overdue: Boolean(p.dueDate && p.overallStatus !== "COMPLETED" && p.dueDate < today),
  });

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {countFor("IN_PROGRESS")} active · {countFor("ON_HOLD")} on hold
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "All projects across the team." : "Projects you lead, belong to or contribute to."}
          </p>
        </div>
        <ProjectFormDialog
          mode="create"
          people={people}
          canChangeLead={isAdmin}
          trigger={
            <Button size="lg">
              <Plus /> Add project
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Project view" className="flex rounded-[10px] border border-input bg-card p-0.5">
          {views.map(({ value, label, icon: Icon }) => {
            const active = view === value;
            return (
              <Link
                key={value}
                href={buildHref(status, value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-[34px] items-center gap-1.5 rounded-[8px] px-3 text-[13px] transition-colors",
                  active ? "bg-foreground font-semibold text-background" : "font-medium text-secondary-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        {!isBoard && (
          <nav aria-label="Project status" className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const active = status === t.value;
              return (
                <Link
                  key={t.label}
                  href={buildHref(t.value, "grid")}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-1.5 rounded-[10px] border px-3.5 text-[13px] transition-colors",
                    active
                      ? "border-foreground bg-foreground font-semibold text-background"
                      : "border-input bg-card font-medium text-secondary-foreground hover:bg-muted"
                  )}
                >
                  {t.label}
                  <span className="font-mono text-xs opacity-75">{t.count}</span>
                </Link>
              );
            })}
          </nav>
        )}
        <form className="flex w-full gap-2 sm:ml-auto sm:w-auto" action="/projects">
          {status && !isBoard && <input type="hidden" name="status" value={status} />}
          {isBoard && <input type="hidden" name="view" value="board" />}
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 sm:w-64 sm:flex-none">
            <Search className="size-4 shrink-0" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
            />
          </label>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">{q || status ? "No matching projects" : "No projects yet"}</h2>
          <p className="text-sm text-muted-foreground">
            {q || status ? "Try different filters." : "Add your first project to get started."}
          </p>
        </div>
      ) : isBoard ? (
        // Columns keep a usable width; narrow screens scroll the board sideways.
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          <div className="grid min-w-[1040px] grid-cols-4 items-start gap-4">
            {BOARD_COLUMNS.map((col) => {
              const items = projects.filter((p) => p.overallStatus === col);
              return (
                <section
                  key={col}
                  aria-label={PROJECT_STATUS_LABEL[col]}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/50 p-3"
                >
                  <header className="flex items-center justify-between px-1">
                    <ProjectStatusChip status={col} />
                    <span className="font-mono text-xs text-muted-foreground">{items.length}</span>
                  </header>
                  {items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      No projects
                    </p>
                  ) : (
                    items.map((p) => <ProjectCard key={p.id} {...cardProps(p)} compact />)
                  )}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} {...cardProps(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

type ProjectCardProps = {
  project: {
    id: string;
    name: string;
    department: string | null;
    overallStatus: ProjectStatus;
    dueDate: Date | null;
    lead: { name: string } | null;
    _count: { members: number };
  };
  progress: { completed: number; total: number; percent: number };
  overdue: boolean;
  /** Board cards sit under a status column, so they drop the chip and tighten spacing. */
  compact?: boolean;
};

function ProjectCard({ project: p, progress, overdue, compact }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${p.id}`}
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card text-foreground transition-colors hover:border-[#CFCDC3]",
        compact ? "gap-3 p-4" : "h-full gap-4 p-[22px]"
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-col gap-1">
          {p.department && <span className="text-xs font-medium text-muted-foreground">{p.department}</span>}
          <h2 className={cn("leading-[1.3] font-semibold", compact ? "text-[15px]" : "text-lg")}>{p.name}</h2>
        </div>
        {!compact && <ProjectStatusChip status={p.overallStatus} />}
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex justify-between text-[13px]">
          <span className="text-muted-foreground">
            {progress.completed} of {progress.total} tasks done
          </span>
          <span className="font-mono font-medium">{progress.percent}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", p.overallStatus === "ON_HOLD" ? "bg-[#9A9890]" : "bg-primary")}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[#EFEDE6] text-[13px] text-secondary-foreground",
          compact ? "pt-3" : "pt-3.5"
        )}
      >
        <span className="min-w-0 truncate">
          Lead <strong className="font-semibold">{p.lead?.name ?? "Unassigned"}</strong>
          <span className="text-muted-foreground">
            {" "}
            · {p._count.members} member{p._count.members === 1 ? "" : "s"}
          </span>
        </span>
        {p.dueDate && (
          <span className={overdue ? "font-semibold text-destructive" : "font-medium text-muted-foreground"}>
            {overdue ? "Past due " : "Due "}
            {formatDate(p.dueDate)}
          </span>
        )}
      </div>
    </Link>
  );
}
