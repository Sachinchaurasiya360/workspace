import Link from "next/link";
import { AlarmClock, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { EventAlert } from "@/lib/event-alerts";
import { ALERT_WINDOWS } from "@/lib/events";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

function when(daysLeft: number) {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

export function EventAlertList({ alerts, limit }: { alerts: EventAlert[]; limit?: number }) {
  const shown = limit ? alerts.slice(0, limit) : alerts;
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">Nothing coming up in this window.</p>;

  return (
    <ul className="flex flex-col">
      {shown.map((a) => {
        const Icon = a.kind === "deadline" ? AlarmClock : CalendarDays;
        return (
          <li
            key={`${a.eventId}-${a.kind}`}
            className={cn(
              "flex items-start gap-3 border-b border-muted py-3 first:pt-0 last:border-b-0 last:pb-0"
            )}
          >
            <Icon className={cn("mt-0.5 size-4 shrink-0", a.needsAction ? "text-warning" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <Link href={`/discovery?q=${encodeURIComponent(a.eventName)}`} className="text-sm font-semibold hover:text-primary">
                {a.eventName}
              </Link>
              <p className="text-xs text-muted-foreground">
                {a.kind === "deadline" ? "Registration closes " : "Event "}
                {when(a.daysLeft)} · {formatDate(a.date)}
                {a.city ? ` · ${a.city}` : ""}
              </p>
            </div>
            {a.needsAction && (
              <Badge variant="warning">{a.kind === "deadline" ? "Register now" : "Coming up"}</Badge>
            )}
            {!a.needsAction && a.registered && <Badge variant="success">Registered</Badge>}
          </li>
        );
      })}
      {limit && alerts.length > limit && (
        <li className="pt-3">
          <Link href="/discovery" className="text-[13px] font-semibold text-primary hover:text-primary-strong">
            +{alerts.length - limit} more on the Events page
          </Link>
        </li>
      )}
    </ul>
  );
}

/** Plain links so the chosen window lives in the URL (?window=14). */
export function AlertWindowPicker({ current, baseQuery }: { current: number; baseQuery: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-medium text-muted-foreground">Next</span>
      <div className="flex rounded-[9px] bg-secondary p-0.5">
        {ALERT_WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/discovery?${baseQuery}${baseQuery ? "&" : ""}window=${w}`}
            className={cn(
              "rounded-[7px] px-2 py-1 font-mono font-medium",
              w === current ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {w}d
          </Link>
        ))}
      </div>
    </div>
  );
}
