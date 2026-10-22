import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { EventAlert } from "@/lib/event-alerts";
import { APP_TIME_ZONE, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/* Small presentational pieces shared by the admin overview and personal dashboards. */

/** "Good morning" / "Good afternoon" / "Good evening" by the team's (IST) clock. */
export function greeting(name: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date())
  );
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const first = name.trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}` : `Good ${part}`;
}

/** e.g. "Wednesday, 7 October" */
export function todayLabel() {
  return formatDate(new Date(), { weekday: "long", day: "numeric", month: "long" });
}

export function DashboardHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{eyebrow}</span>
        <h1 className="font-display text-[34px] sm:text-[44px]">{title}</h1>
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

/** Big-number tile. `warning` switches to the amber "needs attention" treatment. */
export function StatTile({
  label,
  value,
  meta,
  href,
  warning = false,
  compact = false,
}: {
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  href: string;
  warning?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-full flex-col gap-2.5 rounded-2xl border transition-colors",
        compact ? "p-5" : "px-[22px] py-5",
        warning
          ? "border-[#EFD9A8] bg-warning-soft hover:bg-[#F8EACB]"
          : "border-border bg-card hover:bg-[#FBFAF7]"
      )}
    >
      <span className={cn("text-[13px]", warning ? "font-semibold text-[#7A4B00]" : "font-medium text-muted-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[34px] leading-none font-medium tracking-[-0.03em] tabular-nums",
          warning && "text-warning-foreground"
        )}
      >
        {value}
      </span>
      {meta && (
        <span className={cn("text-[13px]", warning ? "font-semibold text-[#7A4B00]" : "text-muted-foreground")}>{meta}</span>
      )}
    </Link>
  );
}

/** Card shell: 24px padding, 17px section title, optional right-side slot. */
export function SectionCard({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[17px] leading-tight font-semibold">{title}</h2>
        {action}
      </div>
      <div className={cn("flex min-w-0 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

/** 13px semibold primary link used in card headers. */
export function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-semibold text-primary hover:text-primary-strong">
      {children}
    </Link>
  );
}

/** Thin progress bar; amber under 50% unless a colour is forced. */
export function ScoreBar({ value, className, tone }: { value: number; className?: string; tone?: "primary" | "muted" }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = tone === "muted" ? "bg-[#9A9890]" : tone === "primary" || pct >= 50 ? "bg-primary" : "bg-warning";
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 52×56 month/day chip. */
export function DateChip({ date }: { date: Date }) {
  return (
    <div className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center gap-px rounded-[10px] bg-background">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {formatDate(date, { month: "short" })}
      </span>
      <span className="font-mono text-xl leading-tight font-medium">{formatDate(date, { day: "2-digit" })}</span>
    </div>
  );
}

function when(daysLeft: number) {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

/** Upcoming events / registration deadlines as date-chip rows. */
export function UpcomingEvents({ alerts, limit }: { alerts: EventAlert[]; limit?: number }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing coming up in this window.</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {shown.map((a) => (
        <li key={`${a.eventId}-${a.kind}`} className="flex items-center gap-3.5">
          <DateChip date={a.date} />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <Link
              href={`/discovery?q=${encodeURIComponent(a.eventName)}`}
              className="truncate text-sm font-semibold text-foreground hover:text-primary"
            >
              {a.eventName}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {a.city ? `${a.city} · ` : ""}
              {a.registered ? "Registered" : formatDate(a.date)}
            </span>
            <span className={cn("text-xs", a.needsAction ? "font-semibold text-[#8A4B00]" : "text-muted-foreground")}>
              {a.kind === "deadline" ? "Registration closes " : "Event "}
              {when(a.daysLeft)}
            </span>
          </div>
          {a.needsAction && (
            <Badge variant="warning" className="shrink-0">
              {a.kind === "deadline" ? "Register now" : "Coming up"}
            </Badge>
          )}
        </li>
      ))}
      {limit && alerts.length > limit && (
        <li>
          <Link href="/discovery" className="text-[13px] font-semibold text-primary hover:text-primary-strong">
            +{alerts.length - limit} more on the Events page
          </Link>
        </li>
      )}
    </ul>
  );
}

/** Project name, % and a progress bar, with an optional meta line. */
export function ProjectProgressList({
  projects,
}: {
  projects: { id: string; name: string; percent: number; meta?: string | null }[];
}) {
  if (projects.length === 0) return <p className="text-sm text-muted-foreground">No active projects.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {projects.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="group flex flex-col gap-2 text-foreground">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold group-hover:text-primary">{p.name}</span>
              <span className="shrink-0 font-mono text-[13px] text-secondary-foreground tabular-nums">{p.percent}%</span>
            </div>
            <ScoreBar value={p.percent} tone="primary" />
            {p.meta && <span className="text-xs text-muted-foreground">{p.meta}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
