"use client";

import { useState, useTransition } from "react";
import { Loader2, NotebookPen } from "lucide-react";

import { submitDailyLog } from "@/actions/daily-logs";
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

const INITIAL = {
  callsMade: 0,
  followUps: 0,
  dealsClosed: 0,
  meetings: 0,
  outboundReach: 0,
  discoveryDemos: 0,
  profilesSignups: 0,
};

const FIELDS: { key: keyof typeof INITIAL; label: string }[] = [
  { key: "callsMade", label: "Calls made" },
  { key: "followUps", label: "Follow-ups" },
  { key: "dealsClosed", label: "Deals closed" },
  { key: "meetings", label: "Meetings" },
  { key: "outboundReach", label: "Outbound reach" },
  { key: "discoveryDemos", label: "Discovery & demos" },
  { key: "profilesSignups", label: "Profiles & signups" },
];

export function DailyLogDialog() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ ...INITIAL });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitDailyLog({ ...values, activitiesHtml: notes || null });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setValues({ ...INITIAL });
      setNotes("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <NotebookPen /> Log activity
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log today&apos;s activity</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  min={0}
                  value={values[f.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="daily-log-notes">Notes</Label>
            <Textarea id="daily-log-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
