"use client";

import { useState } from "react";

import { CommentSection } from "@/components/comments/comment-section";
import { EventResponseButton } from "@/components/discovery/event-response-button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } };

export function EventDetailDialog({
  event,
  comments,
  isFree,
  status,
}: {
  event: {
    id: string;
    name: string;
    city: string | null;
    venue: string | null;
    date: Date | null;
    time: string | null;
    targetAudience: string | null;
    keyHighlights: string | null;
    price: string | null;
    link: string | null;
  };
  comments: CommentEntry[];
  isFree: boolean;
  status: "none" | "pending" | "registered";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="truncate text-left text-sm font-medium hover:underline">{event.name}</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {event.city && <Badge variant="outline">{event.city}</Badge>}
            {event.date && <span>{new Date(event.date).toLocaleDateString()}</span>}
            {event.time && <span>{event.time}</span>}
          </div>
          {event.venue && <p className="text-sm text-muted-foreground">{event.venue}</p>}
          {event.targetAudience && (
            <p className="text-sm">
              <span className="font-medium">Audience: </span>
              {event.targetAudience}
            </p>
          )}
          {event.keyHighlights && <p className="text-sm text-muted-foreground">{event.keyHighlights}</p>}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{event.price ?? "Free"}</span>
            <EventResponseButton eventId={event.id} isFree={isFree} status={status} />
          </div>
          {event.link && (
            <a
              href={event.link}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline underline-offset-4"
            >
              Event page ↗
            </a>
          )}

          <CommentSection entityType="EVENT" entityId={event.id} comments={comments} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
