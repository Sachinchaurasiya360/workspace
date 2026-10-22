"use client";

import { useState } from "react";

import { CommentSection } from "@/components/comments/comment-section";
import { EventDateChip } from "@/components/discovery/event-date-chip";
import { EventResponseButton, type EventStanding } from "@/components/discovery/event-response-button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } | null };

export type EventDetail = {
  id: string;
  name: string;
  city: string | null;
  venue: string | null;
  date: Date | null;
  time: string | null;
  registrationDeadline: Date | null;
  targetAudience: string | null;
  keyHighlights: string | null;
  price: string | null;
  link: string | null;
  registrationStatus: string | null;
};

export function EventDetailDialog({
  event,
  comments,
  isFree,
  standing,
  isPast,
  registrationClosed,
}: {
  event: EventDetail;
  comments: CommentEntry[];
  isFree: boolean;
  standing: EventStanding;
  isPast: boolean;
  registrationClosed?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const place = [event.venue, event.city].filter(Boolean).join(", ");
  const subtitle = [
    event.date ? formatDate(new Date(event.date), { dateStyle: "full" }) : "Date TBC",
    event.time,
    place || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Venue", value: place || null },
    { label: "Target audience", value: event.targetAudience },
    {
      label: "Price",
      value: (
        <span className="flex flex-wrap items-center gap-2">
          {event.price ?? (isFree ? "Free" : "Price not listed")}
          <Badge variant={isFree ? "success" : "warning"}>{isFree ? "Free" : "Paid — needs approval"}</Badge>
        </span>
      ),
    },
    { label: "How to register", value: event.registrationStatus },
    {
      label: "Link",
      value: event.link ? (
        <a href={event.link} target="_blank" rel="noreferrer" className="font-medium text-primary hover:text-primary-strong">
          Event page ↗
        </a>
      ) : null,
    },
  ].filter((r) => r.value);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="text-left text-[17px] leading-[1.3] font-semibold hover:text-primary hover:underline hover:underline-offset-4">
          {event.name}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-[660px] gap-0 overflow-y-auto">
        <div className="flex items-start gap-4 pr-12">
          <EventDateChip date={event.date} size="lg" className="hidden sm:flex" />
          <DialogHeader className="min-w-0 flex-1">
            <DialogTitle>{event.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {subtitle}
              {isPast && (
                <Badge variant="outline" className="ml-2 align-middle">
                  Past event
                </Badge>
              )}
            </p>
          </DialogHeader>
        </div>

        {event.registrationDeadline && (
          <div
            className={cn(
              "mt-[18px] rounded-xl px-3.5 py-3 text-[13px] font-medium",
              registrationClosed ? "bg-muted text-muted-foreground" : "bg-warning-soft text-warning-foreground"
            )}
          >
            {registrationClosed ? "Registration closed " : "Register by "}
            {formatDate(new Date(event.registrationDeadline), { dateStyle: "full" })}
          </div>
        )}

        <dl className="mt-[18px] grid grid-cols-[110px_minmax(0,1fr)] gap-y-3 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd className="m-0 min-w-0 break-words">{r.value}</dd>
            </div>
          ))}
        </dl>

        {event.keyHighlights && (
          <div className="mt-[18px] flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted-foreground">Highlights</span>
            <p className="text-sm leading-[1.55] whitespace-pre-wrap">{event.keyHighlights}</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2.5 border-t border-muted pt-[18px]">
          <span className="text-[13px] font-semibold">Your status</span>
          <EventResponseButton
            eventId={event.id}
            eventName={event.name}
            isFree={isFree}
            standing={standing}
            isPast={isPast}
            registrationClosed={registrationClosed}
          />
        </div>

        <div className="mt-5 border-t border-muted pt-[18px]">
          <CommentSection entityType="EVENT" entityId={event.id} comments={comments} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
