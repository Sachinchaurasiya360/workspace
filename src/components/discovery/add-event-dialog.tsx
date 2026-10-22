"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";

import { createEvent, deleteEvent, updateEvent } from "@/actions/events";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toastResult } from "@/lib/toast-result";

export type EventFormRecord = {
  id: string;
  name: string;
  city: string | null;
  date: Date | string | null;
  time: string | null;
  venue: string | null;
  price: string | null;
  link: string | null;
  keyHighlights: string | null;
  targetAudience: string | null;
  registrationDeadline: Date | string | null;
  registrationStatus: string | null;
};

const dateValue = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 10) : "");

function formFrom(event?: EventFormRecord) {
  return {
    name: event?.name ?? "",
    city: event?.city ?? "",
    date: dateValue(event?.date),
    time: event?.time ?? "",
    venue: event?.venue ?? "",
    price: event?.price ?? "",
    link: event?.link ?? "",
    keyHighlights: event?.keyHighlights ?? "",
    targetAudience: event?.targetAudience ?? "",
    registrationDeadline: dateValue(event?.registrationDeadline),
    registrationStatus: event?.registrationStatus ?? "",
  };
}

/** Add an event (admins + sales) or edit / delete one (admins). */
export function EventFormDialog({ event }: { event?: EventFormRecord }) {
  const mode = event ? "edit" : "create";
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => formFrom(event));
  const [isPending, startTransition] = useTransition();
  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  function submit() {
    startTransition(async () => {
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
      const result = event ? await updateEvent({ id: event.id, ...payload }) : await createEvent(payload);
      if (toastResult(result, event ? "Event saved" : `"${form.name}" added to the event list`)) setOpen(false);
    });
  }

  function remove() {
    if (!event || !confirm(`Delete "${event.name}"? Registrations, comments and approval requests for it go too.`)) return;
    startTransition(async () => {
      if (toastResult(await deleteEvent(event.id), "Event deleted")) setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(formFrom(event));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {mode === "edit" ? (
          <Button size="icon" variant="ghost" className="size-9 text-muted-foreground" aria-label={`Edit ${event!.name}`} title="Edit event">
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="lg">
            <Plus /> Add event
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-[660px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit event" : "Add event"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-name">Name</Label>
            <Input id="event-name" {...field("name")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-city">City</Label>
              <Input id="event-city" {...field("city")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" type="date" {...field("date")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-time">Time</Label>
              <Input id="event-time" placeholder="10:00 AM – 5:00 PM" {...field("time")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-deadline">Registration deadline</Label>
              <Input id="event-deadline" type="date" {...field("registrationDeadline")} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-venue">Venue</Label>
            <Input id="event-venue" {...field("venue")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-audience">Target audience</Label>
            <Input id="event-audience" placeholder="e.g. Early-stage founders, VCs" {...field("targetAudience")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-price">Price</Label>
              <Input id="event-price" placeholder="Free, or e.g. ₹2,500" {...field("price")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-link">Link</Label>
              <Input id="event-link" placeholder="https://…" {...field("link")} />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Write “Free” for free events. Any amount — or no price at all — means registering needs founder approval.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-regstatus">How to register</Label>
            <Input id="event-regstatus" placeholder="e.g. Free RSVP on the event page" {...field("registrationStatus")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-highlights">Key highlights</Label>
            <Textarea id="event-highlights" rows={3} {...field("keyHighlights")} />
          </div>
        </div>

        <DialogFooter>
          {mode === "edit" && (
            <Button type="button" variant="destructive" onClick={remove} disabled={isPending} className="sm:mr-auto">
              Delete
            </Button>
          )}
          <Button type="button" onClick={submit} disabled={isPending || !form.name.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            {mode === "edit" ? "Save changes" : "Add event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Kept for existing imports. */
export function AddEventDialog() {
  return <EventFormDialog />;
}
