"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Mic } from "lucide-react";

import { respondToEvent, updateEventParticipation } from "@/actions/events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EventStanding } from "@/lib/event-constants";
import { toastResult } from "@/lib/toast-result";

export type { EventStanding };

function Done({ label }: { label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-[9px] bg-[#D5EFE4] px-3 text-[13px] font-semibold text-[#135C40]">
      <CheckCircle2 className="size-3.5" />
      {label}
    </span>
  );
}

/**
 * The viewer's two independent tracks for one event:
 * participation (register / request approval → attended) and
 * execution (organising → conducted).
 */
export function EventResponseButton({
  eventId,
  eventName,
  isFree,
  standing,
  isPast,
  registrationClosed,
}: {
  eventId: string;
  eventName: string;
  isFree: boolean;
  standing: EventStanding;
  isPast?: boolean;
  registrationClosed?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ParticipationControl
        eventId={eventId}
        eventName={eventName}
        isFree={isFree}
        standing={standing}
        isPast={isPast}
        registrationClosed={registrationClosed}
      />
      <ExecutionControl eventId={eventId} standing={standing} isPast={isPast} />
    </div>
  );
}

function ParticipationControl({
  eventId,
  eventName,
  isFree,
  standing,
  isPast,
  registrationClosed,
}: {
  eventId: string;
  eventName: string;
  isFree: boolean;
  standing: EventStanding;
  isPast?: boolean;
  registrationClosed?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  if (standing.participation === "ATTENDED") return <Done label="Attended" />;
  if (standing.participation === "REGISTERED") {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            toastResult(await updateEventParticipation({ eventId, change: "ATTENDED" }), "Marked as attended");
          })
        }
      >
        {isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark attended
      </Button>
    );
  }
  if (standing.approval !== "none") {
    return (
      <Button size="sm" variant="outline" disabled>
        {standing.approval === "discuss" ? "Under discussion" : "Approval pending"}
      </Button>
    );
  }
  // Nothing to register for once the event is over.
  if (isPast) return null;
  if (registrationClosed) {
    return (
      <Button size="sm" variant="outline" disabled>
        Registration closed
      </Button>
    );
  }

  if (isFree) {
    return (
      <Button
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            toastResult(await respondToEvent(eventId), `Registered for "${eventName}"`);
          })
        }
      >
        {isPending && <Loader2 className="animate-spin" />}
        Register
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Request approval</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request approval — {eventName}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`note-${eventId}`}>Why should you attend?</Label>
          <Textarea
            id={`note-${eventId}`}
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Who you'll meet, expected outcome, budget notes…"
          />
          <p className="text-xs text-muted-foreground">This goes to the founders along with the event details.</p>
        </div>
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                if (toastResult(await respondToEvent(eventId, note), "Approval requested")) {
                  setOpen(false);
                  setNote("");
                }
              })
            }
          >
            {isPending && <Loader2 className="animate-spin" />}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionControl({ eventId, standing, isPast }: { eventId: string; standing: EventStanding; isPast?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const set = (change: "IN_PLAN" | "CONDUCTED", message: string) =>
    startTransition(async () => {
      toastResult(await updateEventParticipation({ eventId, change }), message);
    });

  if (standing.execution === "CONDUCTED") return <Done label="Conducted" />;
  if (standing.execution === "IN_PLAN" || isPast) {
    return (
      <Button size="sm" variant="outline" disabled={isPending} onClick={() => set("CONDUCTED", "Marked as conducted")}>
        <Mic /> {standing.execution === "IN_PLAN" ? "Mark conducted" : "Conducted"}
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      title="You're organising or running this event"
      onClick={() => set("IN_PLAN", "Added to events you're organising")}
    >
      <Mic /> I&apos;m organising
    </Button>
  );
}
