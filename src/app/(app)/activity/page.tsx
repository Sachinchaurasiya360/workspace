import Link from "next/link";
import { redirect } from "next/navigation";

import { ActivityList } from "@/components/activity/activity-list";
import { Button } from "@/components/ui/button";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { ACTIVITY_KINDS, getVisibleActivity, type ActivityKind } from "@/lib/activity";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<ActivityKind, string> = {
  all: "Everything",
  tasks: "Tasks",
  projects: "Projects",
  events: "Events",
  approvals: "Approvals",
  discussions: "Discussions",
  updates: "Daily updates",
  leads: "Leads",
};

const PAGE = 50;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;

  const kinds = ACTIVITY_KINDS.filter((k) => k !== "leads" || isAdmin || hasSalesAccess(user));
  const kind = kinds.includes(params.kind as ActivityKind) ? (params.kind as ActivityKind) : "all";
  const actorId = isAdmin && typeof params.actor === "string" ? params.actor : undefined;
  const limit = Math.min(500, Math.max(PAGE, Number(params.limit) || PAGE));

  const [items, people] = await Promise.all([
    getVisibleActivity(user, { kind, actorId, limit: limit + 1 }),
    isAdmin ? db.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const hasMore = items.length > limit;

  const href = (next: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const merged = { kind, actor: actorId, ...next };
    for (const [k, v] of Object.entries(merged)) if (v && v !== "all") q.set(k, String(v));
    const qs = q.toString();
    return `/activity${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{isAdmin ? "Across the workspace" : "Your workspace"}</span>
        <h1 className="font-display text-[34px] sm:text-[44px]">Activity</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Everything happening across the workspace, newest first."
            : "What's happening on your tasks, projects, events and leads."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Activity type" className="flex max-w-full flex-wrap gap-0.5 rounded-[11px] bg-secondary p-1">
          {kinds.map((k) => (
            <Link
              key={k}
              href={href({ kind: k, limit: undefined })}
              aria-current={k === kind ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] whitespace-nowrap transition-colors",
                k === kind
                  ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(23,24,28,0.08)]"
                  : "font-medium text-secondary-foreground hover:text-foreground"
              )}
            >
              {KIND_LABEL[k]}
            </Link>
          ))}
        </nav>
        {isAdmin && (
          <form action="/activity" className="flex items-center gap-2">
            {kind !== "all" && <input type="hidden" name="kind" value={kind} />}
            <select
              name="actor"
              defaultValue={actorId ?? ""}
              aria-label="Person"
              className="h-10 min-w-0 rounded-[11px] border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Anyone</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        )}
      </div>

      <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-1 text-[17px] font-semibold">{KIND_LABEL[kind] === "Everything" ? "Latest activity" : KIND_LABEL[kind]}</h2>
        <ActivityList items={items.slice(0, limit)} />
        {hasMore && (
          <div className="pt-3">
            <Button asChild variant="outline">
              <Link href={href({ limit: limit + PAGE })} scroll={false}>
                Show more
              </Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
