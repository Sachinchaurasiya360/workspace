import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { AlertCircle, MapPin, Search } from "lucide-react";

import { EventFormDialog } from "@/components/discovery/add-event-dialog";
import { AlertWindowPicker, EventAlertList } from "@/components/discovery/event-alerts";
import { EventDateChip } from "@/components/discovery/event-date-chip";
import { EventDetailDialog } from "@/components/discovery/event-detail-dialog";
import { EventResponseButton } from "@/components/discovery/event-response-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_VARIANT } from "@/lib/approval-constants";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { NO_STANDING, standingLabels, type EventStanding } from "@/lib/event-constants";
import { isValidDateString } from "@/lib/dates";
import { getEventAlerts } from "@/lib/event-alerts";
import { addDays, isFreeEvent, parseAlertWindow, startOfToday } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const FIELD =
  "h-11 rounded-[11px] border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const PILL = "inline-flex w-fit items-center rounded-xl px-2.5 py-[5px] text-xs font-semibold whitespace-nowrap";
/** Colour per standing label, matching the event cards in the design. */
const STANDING_PILL: Record<string, string> = {
  "In plan": "bg-muted text-secondary-foreground",
  Registered: "bg-primary-soft text-primary-strong",
  Attended: "bg-[#D5EFE4] text-[#135C40]",
  Conducted: "bg-foreground text-background",
};

const MINE_FILTERS = [
  { value: "", label: "All" },
  { value: "going", label: "Registered / attended" },
  { value: "planned", label: "Organising / conducted" },
  { value: "pending", label: "Awaiting approval" },
  { value: "none", label: "Not involved" },
];

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const params = await searchParams;
  const isAdmin = canManageAll(user);
  const canAdd = isAdmin || hasSalesAccess(user);

  const q = one(params.q).trim();
  const city = one(params.city);
  const from = one(params.from);
  const to = one(params.to);
  const when = one(params.when) || "upcoming";
  const mine = one(params.mine);
  const cost = one(params.cost);
  const windowDays = parseAlertWindow(params.window);
  const today = startOfToday();

  const filters: Prisma.EventWhereInput[] = [];
  if (q) {
    filters.push({
      OR: ["name", "city", "venue", "targetAudience", "keyHighlights"].map((field) => ({
        [field]: { contains: q, mode: "insensitive" },
      })),
    });
  }
  if (city) filters.push({ city: { equals: city, mode: "insensitive" } });
  // Event dates are date-only values (UTC midnight of the calendar day).
  if (isValidDateString(from)) filters.push({ date: { gte: new Date(`${from}T00:00:00Z`) } });
  if (isValidDateString(to)) filters.push({ date: { lte: new Date(`${to}T00:00:00Z`) } });
  // Expired events are hidden unless explicitly asked for.
  if (when === "upcoming") filters.push({ OR: [{ date: { gte: today } }, { date: null }] });
  if (when === "past") filters.push({ date: { lt: today } });

  const [eventsRaw, myOverviews, myApprovals, cities, alerts] = await Promise.all([
    db.event.findMany({
      where: { AND: filters },
      orderBy: [{ date: { sort: when === "past" ? "desc" : "asc", nulls: "last" } }],
      // "My status" and price are filtered below, so fetch generously and cap after filtering.
      take: 2000,
    }),
    db.eventOverview.findMany({ where: { userId: user.id }, include: { event: true }, orderBy: { updatedAt: "desc" } }),
    db.approval.findMany({
      where: { requestedById: user.id, type: "EVENT_ATTENDANCE" },
      include: { event: { select: { name: true } }, approvedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.event.findMany({ where: { city: { not: null } }, select: { city: true }, distinct: ["city"], orderBy: { city: "asc" } }),
    getEventAlerts(user.id, windowDays),
  ]);

  const overviewByEvent = new Map(myOverviews.map((o) => [o.eventId, o]));
  const openApproval = new Map(
    myApprovals.filter((a) => a.status === "REQUEST_RAISED" || a.status === "DISCUSS").map((a) => [a.eventId!, a.status])
  );
  const standingOf = (eventId: string): EventStanding => {
    const o = overviewByEvent.get(eventId);
    const approval = openApproval.get(eventId);
    return {
      ...NO_STANDING,
      participation: o?.participation ?? null,
      execution: o?.execution ?? null,
      approval: approval === "DISCUSS" ? "discuss" : approval ? "pending" : "none",
    };
  };

  const events = eventsRaw.filter((e) => {
    const free = isFreeEvent(e.price, e.registrationStatus);
    if (cost === "free" && !free) return false;
    if (cost === "paid" && free) return false;
    const s = standingOf(e.id);
    if (mine === "going") return !!s.participation;
    if (mine === "planned") return !!s.execution;
    if (mine === "pending") return s.approval !== "none";
    if (mine === "none") return !s.participation && !s.execution && s.approval === "none";
    return true;
  }).slice(0, 200);

  const eventComments = await db.comment.findMany({
    where: { entityType: "EVENT", eventId: { in: events.map((e) => e.id) } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const queryWith = (overrides: Record<string, string>) =>
    new URLSearchParams(
      Object.entries({ q, city, from, to, when: when === "upcoming" ? "" : when, mine, cost, ...overrides }).filter(([, v]) => v)
    ).toString();
  const baseQuery = queryWith({});
  const mineHref = (value: string) => {
    const query = queryWith({ mine: value, window: windowDays !== 14 ? String(windowDays) : "" });
    return query ? `/discovery?${query}` : "/discovery";
  };
  const hasFilters = !!(q || city || from || to || mine || cost || when !== "upcoming");

  // Deadlines the viewer still has to act on — summarised in the banner up top.
  const urgentDeadlines = alerts.filter((a) => a.kind === "deadline" && a.needsAction);
  const deadlineSoon = addDays(today, windowDays);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            Discovery · discover events, register, and track your participation
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Events</h1>
        </div>
        {canAdd && <EventFormDialog />}
      </header>

      {urgentDeadlines.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] border border-[#EFD9A8] bg-warning-soft px-[18px] py-3.5 text-warning-foreground">
          <AlertCircle className="size-5 shrink-0" />
          <p className="min-w-0 flex-1 text-sm">
            <strong className="font-semibold">
              {urgentDeadlines.length} registration deadline{urgentDeadlines.length === 1 ? "" : "s"} in the next {windowDays} days.
            </strong>{" "}
            {urgentDeadlines
              .slice(0, 3)
              .map((a) => `${a.eventName} closes ${formatDate(a.date, { day: "numeric", month: "short" })}`)
              .join(", ")}
            {urgentDeadlines.length > 3 ? `, and ${urgentDeadlines.length - 3} more` : ""}.
          </p>
          <span className="text-[13px] font-semibold">Alert window: {windowDays} days</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <form className="flex flex-wrap items-end gap-2.5" action="/discovery">
          <label className="flex h-11 w-full items-center gap-2 rounded-[11px] border border-input bg-card px-3.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/40 sm:w-[380px]">
            <Search className="size-4 shrink-0" />
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search name, city, venue, audience, highlights…"
              aria-label="Search events"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          <select name="city" defaultValue={city} className={FIELD} aria-label="City">
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.city} value={c.city!}>
                {c.city}
              </option>
            ))}
          </select>
          <select name="when" defaultValue={when} className={FIELD} aria-label="Event status">
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All dates</option>
          </select>
          <select name="cost" defaultValue={cost} className={FIELD} aria-label="Price">
            <option value="">Free & paid</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            From
            <input type="date" name="from" defaultValue={from} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            To
            <input type="date" name="to" defaultValue={to} className={FIELD} />
          </label>
          {mine && <input type="hidden" name="mine" value={mine} />}
          {windowDays !== 14 && <input type="hidden" name="window" value={windowDays} />}
          <Button type="submit" variant="secondary" className="h-11">
            Apply
          </Button>
          {hasFilters && (
            <Button asChild variant="ghost" className="h-11">
              <Link href="/discovery">Clear</Link>
            </Button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="My status" className="flex flex-wrap gap-2">
            {MINE_FILTERS.map((f) => {
              const active = mine === f.value;
              return (
                <Link
                  key={f.value || "all"}
                  href={mineHref(f.value)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center rounded-[11px] border px-4 text-[13px] transition-colors",
                    active
                      ? "border-foreground bg-foreground font-semibold text-background"
                      : "border-input bg-card font-medium text-secondary-foreground hover:bg-muted"
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
          <span className="ml-auto text-[13px] font-medium text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {events.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? "No events match these filters." : "No upcoming events yet — add one."}
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => {
            const standing = standingOf(event.id);
            const free = isFreeEvent(event.price, event.registrationStatus);
            const registrationClosed = !!event.registrationDeadline && event.registrationDeadline < today;
            const isPast = !!event.date && event.date < today;
            const labels = standingLabels(standing);
            const deadlineUrgent =
              !!event.registrationDeadline && !registrationClosed && event.registrationDeadline < deadlineSoon && !standing.participation;
            const place = [event.city, event.venue].filter(Boolean).join(" · ");
            return (
              <article
                key={event.id}
                className={cn("flex flex-col gap-4 rounded-2xl border border-border bg-card p-5", isPast && "opacity-80")}
              >
                <div className="flex items-start justify-between gap-3">
                  <EventDateChip date={event.date} />
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {labels.map((label) => (
                      <span key={label} className={cn(PILL, STANDING_PILL[label])}>
                        {label}
                      </span>
                    ))}
                    {standing.approval !== "none" && (
                      <span className={cn(PILL, "bg-warning-soft text-warning-foreground")}>
                        {standing.approval === "discuss" ? "Under discussion" : "Approval pending"}
                      </span>
                    )}
                    {isPast && <span className={cn(PILL, "border border-border text-muted-foreground")}>Past</span>}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <EventDetailDialog
                    event={event}
                    comments={eventComments.filter((c) => c.eventId === event.id)}
                    isFree={free}
                    standing={standing}
                    isPast={isPast}
                    registrationClosed={registrationClosed}
                  />
                  {(place || event.time) && (
                    <span className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" />
                      <span className="min-w-0">
                        {place || "Venue TBC"}
                        {event.time ? ` · ${event.time}` : ""}
                      </span>
                    </span>
                  )}
                </div>

                {event.keyHighlights && (
                  <p className="line-clamp-3 text-[13px] leading-normal whitespace-pre-wrap text-secondary-foreground">
                    {event.keyHighlights}
                  </p>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {event.targetAudience && (
                    <span className="rounded-[7px] bg-background px-[9px] py-1 text-xs text-secondary-foreground">
                      For: {event.targetAudience}
                    </span>
                  )}
                  <span
                    className={cn(
                      "rounded-[7px] px-[9px] py-1 text-xs",
                      free ? "bg-[#D5EFE4] text-[#135C40]" : "bg-warning-soft text-warning-foreground"
                    )}
                  >
                    {free ? "Free" : event.price ?? "Needs approval"}
                  </span>
                </div>

                <div className="mt-auto flex flex-col gap-3 border-t border-muted pt-3.5">
                  {(event.registrationDeadline || event.registrationStatus) && (
                    <div className="flex flex-col gap-0.5">
                      {event.registrationDeadline && (
                        <span
                          className={cn(
                            "text-xs",
                            registrationClosed
                              ? "font-medium text-muted-foreground line-through"
                              : deadlineUrgent
                                ? "font-semibold text-[#8A4B00]"
                                : "font-medium text-muted-foreground"
                          )}
                        >
                          Register by {formatDate(event.registrationDeadline)}
                        </span>
                      )}
                      {event.registrationStatus && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">{event.registrationStatus}</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EventResponseButton
                      eventId={event.id}
                      eventName={event.name}
                      isFree={free}
                      standing={standing}
                      isPast={isPast}
                      registrationClosed={registrationClosed}
                    />
                    {isAdmin && <EventFormDialog event={event} />}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[17px] font-semibold">Alerts & deadlines</h2>
            <AlertWindowPicker current={windowDays} baseQuery={baseQuery} />
          </div>
          <EventAlertList alerts={alerts} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">My event overview</h2>
          {myOverviews.length === 0 && <p className="text-sm text-muted-foreground">You haven&apos;t joined any events yet.</p>}
          {myOverviews.length > 0 && (
            <ul className="flex flex-col">
              {myOverviews.map((o) => (
                <li key={o.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-muted py-2 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{o.event.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.event.date ? formatDate(o.event.date) : "Date TBC"}
                      {o.event.date && o.event.date < today ? " · past" : ""}
                    </p>
                  </div>
                  <span className="flex shrink-0 gap-1">
                    {standingLabels(o).map((label) => (
                      <span key={label} className={cn(PILL, STANDING_PILL[label])}>
                        {label}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Approval tracker</h2>
          {myApprovals.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {myApprovals.length > 0 && (
            <ul className="flex flex-col">
              {myApprovals.map((a) => (
                <li key={a.id} className="flex min-h-[52px] flex-col justify-center gap-1 border-b border-muted py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{a.event?.name}</span>
                    <Badge variant={APPROVAL_STATUS_VARIANT[a.status]}>{APPROVAL_STATUS_LABEL[a.status]}</Badge>
                  </div>
                  {a.comment && (
                    <p className="text-xs text-muted-foreground">
                      {a.approvedBy?.name ?? "Founder"}: “{a.comment}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
