"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

import { createEvent } from "@/actions/events";
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

export function AddEventDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [price, setPrice] = useState("");
  const [link, setLink] = useState("");
  const [keyHighlights, setKeyHighlights] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setCity("");
    setDate("");
    setVenue("");
    setPrice("");
    setLink("");
    setKeyHighlights("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createEvent({
        name,
        city: city || null,
        date: date || null,
        venue: venue || null,
        price: price || null,
        link: link || null,
        keyHighlights: keyHighlights || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus /> Add event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-name">Name</Label>
            <Input id="event-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-city">City</Label>
              <Input id="event-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-venue">Venue</Label>
            <Input id="event-venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-price">Price</Label>
              <Input id="event-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Free" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="event-link">Link</Label>
              <Input id="event-link" value={link} onChange={(e) => setLink(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="event-highlights">Key highlights</Label>
            <Textarea
              id="event-highlights"
              value={keyHighlights}
              onChange={(e) => setKeyHighlights(e.target.value)}
              rows={3}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending || !name.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
