import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";

import { canManageAll, hasSalesAccess } from "@/lib/access";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { db } from "@/lib/db";
import { LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { PROJECT_STATUS_LABEL } from "@/lib/project-constants";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { STATUS_LABEL } from "@/lib/task-constants";
import { visibleProjectsWhere, visibleTasksWhere } from "@/lib/visibility";

const LIMIT = 8;

type Hit = { id: string; href: string; title: string; subtitle?: string | null; badge?: string };

function countLabel(n: number) {
  return n === LIMIT ? `${LIMIT}+` : String(n);
}

function Section({ id, title, hits, moreHref }: { id: string; title: string; hits: Hit[]; moreHref?: string }) {
  if (hits.length === 0) return null;
  return (
    <section id={id} className="flex scroll-mt-6 flex-col gap-1 rounded-2xl border border-border bg-card px-6 py-5">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {title} <span className="font-mono tracking-normal">{countLabel(hits.length)}</span>
        </h2>
        {moreHref && hits.length === LIMIT && (
          <Link href={moreHref} className="text-[13px] font-semibold text-primary hover:text-primary-strong">
            See all
          </Link>
        )}
      </div>
      {hits.map((h) => (
        <Link
          key={h.id}
          href={h.href}
          className="-mx-2 flex min-h-12 items-center justify-between gap-3 border-b border-[#EFEDE6] px-2 py-1.5 text-foreground transition-colors last:border-b-0 hover:bg-background"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">{h.title}</span>
            {h.subtitle && <span className="truncate text-xs text-muted-foreground">{h.subtitle}</span>}
          </div>
          {h.badge && <span className="shrink-0 text-xs text-muted-foreground">{h.badge}</span>}
        </Link>
      ))}
    </section>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const isAdmin = canManageAll(user);
  const canLeads = isAdmin || hasSalesAccess(user);
  const contains = { contains: q, mode: "insensitive" as const };

  const [members, tasks, projects, events, leads] = q
    ? await Promise.all([
        db.user.findMany({
          where: { isActive: true, OR: [{ name: contains }, { email: contains }, { role: contains }] },
          select: { id: true, name: true, role: true, email: true, access: true },
          take: LIMIT,
        }),
        db.task.findMany({
          where: { AND: [visibleTasksWhere(user), { OR: [{ title: contains }, { description: contains }] }] },
          select: { id: true, title: true, status: true, projectId: true, assigneeId: true, project: { select: { name: true } }, assignee: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: LIMIT,
        }),
        db.project.findMany({
          where: { AND: [visibleProjectsWhere(user), { OR: [{ name: contains }, { department: contains }, { projectCode: contains }, { notes: contains }] }] },
          select: { id: true, name: true, overallStatus: true, department: true, lead: { select: { name: true } } },
          take: LIMIT,
        }),
        db.event.findMany({
          where: { OR: [{ name: contains }, { city: contains }, { venue: contains }, { targetAudience: contains }, { keyHighlights: contains }] },
          select: { id: true, name: true, city: true, date: true },
          orderBy: { date: { sort: "desc", nulls: "last" } },
          take: LIMIT,
        }),
        canLeads
          ? db.lead.findMany({
              where: { ...(isAdmin ? {} : { ownerId: user.id }), OR: [{ name: contains }, { company: contains }, { email: contains }] },
              select: { id: true, name: true, company: true, stage: true },
              take: LIMIT,
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  // Only link a task to its project board when the viewer can open that board.
  const taskProjectIds = [...new Set(tasks.map((t) => t.projectId).filter((id): id is string => !!id))];
  const openableProjects = new Set(
    taskProjectIds.length
      ? (await db.project.findMany({
          where: { AND: [{ id: { in: taskProjectIds } }, visibleProjectsWhere(user)] },
          select: { id: true },
        })).map((p) => p.id)
      : []
  );
  const taskHref = (t: (typeof tasks)[number]) =>
    t.projectId && openableProjects.has(t.projectId)
      ? `/projects/${t.projectId}`
      : `/tasks?q=${encodeURIComponent(t.title)}&status=${t.status}${isAdmin ? "" : "&scope=all"}`;

  const total = members.length + tasks.length + projects.length + events.length + leads.length;
  const enc = encodeURIComponent(q);

  const groups = [
    { id: "tasks", label: "Tasks", count: tasks.length },
    { id: "projects", label: "Projects", count: projects.length },
    { id: "events", label: "Events", count: events.length },
    { id: "members", label: "Members", count: members.length },
    ...(canLeads ? [{ id: "leads", label: "Leads", count: leads.length }] : []),
  ].filter((g) => g.count > 0);
  const capped = [members, tasks, projects, events, leads].some((list) => list.length === LIMIT);

  return (
    <div className="flex flex-col gap-[22px]">
      <header className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">
          {q
            ? `${total}${capped ? "+" : ""} result${total === 1 ? "" : "s"} across the workspace`
            : `Team members, tasks, projects, events${canLeads ? " and leads" : ""}`}
        </span>
        <h1 className="font-display text-[34px] break-words sm:text-[44px]">{q ? `“${q}”` : "Search"}</h1>
      </header>

      <form action="/search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          type="search"
          defaultValue={q}
          autoFocus
          aria-label="Search the workspace"
          placeholder="Search the workspace…"
          className="h-11 w-full rounded-[11px] border border-input bg-card pr-3 pl-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </form>

      {groups.length > 1 && (
        <nav aria-label="Jump to results" className="flex flex-wrap gap-2">
          <span className="inline-flex h-10 items-center rounded-[10px] border border-foreground bg-foreground px-3.5 text-[13px] font-semibold text-background">
            All {total}
            {capped ? "+" : ""}
          </span>
          {groups.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-input bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
            >
              {g.label} <span className="font-mono">{countLabel(g.count)}</span>
            </a>
          ))}
        </nav>
      )}

      {q && total === 0 && (
        <p className="rounded-[14px] bg-card px-[18px] py-3.5 text-sm text-muted-foreground">No results for “{q}”.</p>
      )}
      {!q && <p className="text-sm text-muted-foreground">Type something to search.</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          id="tasks"
          title="Tasks"
          moreHref={`/tasks?q=${enc}${isAdmin ? "" : "&scope=all"}`}
          hits={tasks.map((t) => ({
            id: t.id,
            href: taskHref(t),
            title: t.title,
            subtitle: [t.assignee.name, t.project?.name].filter(Boolean).join(" · "),
            badge: STATUS_LABEL[t.status],
          }))}
        />
        <Section
          id="projects"
          title="Projects"
          moreHref={`/projects?q=${enc}`}
          hits={projects.map((p) => ({
            id: p.id,
            href: `/projects/${p.id}`,
            title: p.name,
            subtitle: [p.department, p.lead ? `Lead: ${p.lead.name}` : null].filter(Boolean).join(" · "),
            badge: PROJECT_STATUS_LABEL[p.overallStatus],
          }))}
        />
        <Section
          id="events"
          title="Events"
          moreHref={`/discovery?q=${enc}&when=all`}
          hits={events.map((e) => ({
            id: e.id,
            href: `/discovery?q=${encodeURIComponent(e.name)}&when=all`,
            title: e.name,
            subtitle: [e.city, e.date ? formatDate(e.date) : null].filter(Boolean).join(" · "),
          }))}
        />
        <Section
          id="members"
          title="Team members"
          hits={members.map((m) => ({
            id: m.id,
            href: isAdmin ? `/?viewAs=${m.id}` : `/search?q=${encodeURIComponent(m.name)}`,
            title: m.name,
            subtitle: `${m.role} · ${m.email}`,
            badge: ACCESS_LABEL[m.access],
          }))}
        />
        {canLeads && (
          <Section
            id="leads"
            title="Leads"
            moreHref={`/leads?q=${enc}`}
            hits={leads.map((l) => ({
              id: l.id,
              href: `/leads/${l.id}`,
              title: l.name,
              subtitle: l.company,
              badge: LEAD_STAGE_LABEL[l.stage],
            }))}
          />
        )}
      </div>
    </div>
  );
}
