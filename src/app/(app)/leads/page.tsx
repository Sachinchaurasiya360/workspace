import Link from "next/link";
import { redirect } from "next/navigation";
import type { LeadStage, Prisma } from "@prisma/client";
import { Search } from "lucide-react";

import { ColumnChart } from "@/components/charts/charts";
import { LeadFormDialog } from "@/components/leads/lead-forms";
import { LeadStageChip } from "@/components/leads/lead-stage-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { addDays, startOfToday } from "@/lib/events";
import { LEAD_OWNER_ACCESS, LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { getCurrentUser } from "@/lib/session";
import { visibleProjectsWhere } from "@/lib/visibility";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

const FIELD =
  "h-11 rounded-[11px] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const ROW_GRID = "sm:grid sm:grid-cols-[minmax(0,1fr)_100px_90px_130px] sm:items-center sm:gap-3.5";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  if (!isAdmin && !hasSalesAccess(user)) redirect("/");

  const params = await searchParams;
  const q = one(params.q).trim();
  const stage = LEAD_STAGES.includes(one(params.stage) as LeadStage) ? (one(params.stage) as LeadStage) : "";
  const owner = isAdmin ? one(params.owner) : user.id;
  const followUp = one(params.followup) === "due";
  const today = startOfToday();
  const tomorrow = addDays(today, 1);

  const scope: Prisma.LeadWhereInput = owner ? { ownerId: owner } : {};
  const where: Prisma.LeadWhereInput = {
    AND: [
      scope,
      q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {},
      stage ? { stage } : {},
      followUp ? { nextFollowUp: { lt: tomorrow }, stage: { notIn: ["WON", "LOST"] } } : {},
    ],
  };

  const [leads, stageCounts, owners, dueCount, projects] = await Promise.all([
    db.lead.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        project: { select: { name: true } },
        _count: { select: { activities: true, tasks: true } },
      },
      orderBy: [{ nextFollowUp: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: 200,
    }),
    db.lead.groupBy({ by: ["stage"], where: scope, _count: { _all: true }, _sum: { value: true } }),
    isAdmin
      ? db.user.findMany({
          where: { isActive: true, OR: [{ access: { in: LEAD_OWNER_ACCESS } }, { leadsOwned: { some: {} } }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(undefined),
    db.lead.count({ where: { ...scope, nextFollowUp: { lt: tomorrow }, stage: { notIn: ["WON", "LOST"] } } }),
    db.project.findMany({ where: visibleProjectsWhere(user), select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const countOf = (s: LeadStage) => stageCounts.find((c) => c.stage === s)?._count._all ?? 0;
  const totalCount = stageCounts.reduce((sum, s) => sum + s._count._all, 0);
  const openCount = totalCount - countOf("WON") - countOf("LOST");
  const pipelineValue = stageCounts
    .filter((s) => s.stage !== "WON" && s.stage !== "LOST")
    .reduce((sum, s) => sum + (s._sum.value ?? 0), 0);
  const wonValue = stageCounts.find((s) => s.stage === "WON")?._sum.value ?? 0;
  const won = countOf("WON");
  const lost = countOf("LOST");
  const winRate = won + lost ? Math.round((won / (won + lost)) * 100) : null;

  const stageHref = (value: string) => {
    const query = new URLSearchParams(
      Object.entries({ q, stage: value, owner: isAdmin ? owner : "", followup: followUp ? "due" : "" }).filter(([, v]) => v)
    ).toString();
    return query ? `/leads?${query}` : "/leads";
  };
  const stageTiles = [
    { value: "", label: "All", count: totalCount },
    ...LEAD_STAGES.map((s) => ({ value: s as string, label: LEAD_STAGE_LABEL[s], count: countOf(s) })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {openCount} open lead{openCount === 1 ? "" : "s"} · {inr.format(pipelineValue)} in pipeline ·{" "}
            {isAdmin ? "every prospect across the sales team" : "your prospects, their stage and next follow-ups"}
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Leads</h1>
        </div>
        <LeadFormDialog mode="create" owners={owners} projects={projects} />
      </header>

      <nav aria-label="Stage" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {stageTiles.map((t) => {
          const active = stage === t.value;
          return (
            <Link
              key={t.value || "all"}
              href={stageHref(t.value)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-start justify-center gap-0.5 rounded-xl border px-3.5 transition-colors",
                active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              <span className="text-xs font-semibold">{t.label}</span>
              <span className="font-mono text-xl font-medium">{t.count}</span>
            </Link>
          );
        })}
      </nav>

      <form className="flex flex-wrap items-center gap-2.5" action="/leads">
        <label className="flex h-11 w-full items-center gap-2 rounded-[11px] border border-input bg-card px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40 sm:w-[380px]">
          <Search className="size-4 shrink-0" />
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search name, company, email…"
            aria-label="Search leads"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
          />
        </label>
        <select name="stage" defaultValue={stage} className={FIELD} aria-label="Stage">
          <option value="">Any stage</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        {owners && (
          <select name="owner" defaultValue={owner} className={FIELD} aria-label="Owner">
            <option value="">All owners</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <label className="flex h-11 items-center gap-2 text-[13px] font-medium text-secondary-foreground">
          <input type="checkbox" name="followup" value="due" defaultChecked={followUp} className="size-4 accent-foreground" />
          Follow-up due
        </label>
        <Button type="submit" variant="secondary" className="h-11">
          Apply
        </Button>
      </form>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card">
          <div
            className={cn(
              "hidden h-11 border-b border-border bg-sidebar px-[18px] text-xs font-semibold text-muted-foreground",
              ROW_GRID
            )}
          >
            <span>Lead</span>
            <span>Stage</span>
            <span className="text-right">Value</span>
            <span>Next follow-up</span>
          </div>
          {leads.length === 0 && (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">
              {q || stage || followUp || (isAdmin && owner) ? "No leads match these filters." : "No leads yet — add your first prospect."}
            </p>
          )}
          {leads.map((l) => {
            const due = !!l.nextFollowUp && l.nextFollowUp < tomorrow && l.stage !== "WON" && l.stage !== "LOST";
            const isToday = !!l.nextFollowUp && l.nextFollowUp >= today && l.nextFollowUp < tomorrow;
            return (
              <Link
                key={l.id}
                href={`/leads/${l.id}`}
                className={cn(
                  "flex flex-col gap-2 border-b border-muted px-[18px] py-3 transition-colors last:border-b-0 hover:bg-[#F3F5FC] sm:min-h-[60px] sm:py-2.5",
                  ROW_GRID,
                  due && "shadow-[inset_3px_0_0_var(--color-warning)]"
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{l.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      l.company,
                      l.source,
                      isAdmin ? l.owner.name : null,
                      l.project?.name,
                      `${l._count.activities} activit${l._count.activities === 1 ? "y" : "ies"}`,
                      l._count.tasks ? `${l._count.tasks} task${l._count.tasks === 1 ? "" : "s"}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:contents">
                  <LeadStageChip stage={l.stage} className="sm:justify-self-start" />
                  <span className="font-mono text-[13px] sm:text-right">{l.value !== null ? inr.format(l.value) : "—"}</span>
                  <span className={cn("text-[13px]", due ? "font-semibold text-[#8A4B00]" : "font-medium text-secondary-foreground")}>
                    {l.nextFollowUp
                      ? isToday
                        ? "Today"
                        : formatDate(l.nextFollowUp, { weekday: "short", day: "numeric", month: "short" })
                      : "—"}
                    {due && !isToday && (
                      <Badge variant="warning" className="ml-1.5 align-middle sm:hidden">
                        Follow-up due
                      </Badge>
                    )}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <aside aria-label="Pipeline summary" className="flex w-full shrink-0 flex-col gap-4 lg:w-[400px]">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Open pipeline", value: inr.format(pipelineValue) },
              { label: "Won value", value: inr.format(wonValue) },
              { label: "Win rate", value: winRate === null ? "—" : `${winRate}%` },
              { label: "Follow-ups due", value: dueCount, tone: dueCount ? "text-[#8A4B00]" : "" },
            ].map((t) => (
              <div key={t.label} className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5">
                <span className="text-[13px] font-medium text-muted-foreground">{t.label}</span>
                <span className={cn("truncate font-mono text-[26px] font-medium tracking-tight", t.tone)}>{t.value}</span>
              </div>
            ))}
          </div>
          <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-[17px] font-semibold">Pipeline by stage</h2>
            <ColumnChart
              valueName="Leads"
              data={LEAD_STAGES.map((s) => ({ label: LEAD_STAGE_LABEL[s], value: countOf(s) }))}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
