"use client";

import { useState, useTransition } from "react";
import { Loader2, NotebookPen } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_COLOR, STATUS_LABEL, TASK_STATUSES } from "@/lib/task-constants";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@prisma/client";

const INITIAL = {
  callsMade: 0,
  followUps: 0,
  meetings: 0,
  dealsClosed: 0,
  outboundReach: 0,
  discoveryDemos: 0,
  profilesSignups: 0,
};

const FIELDS: { key: keyof typeof INITIAL; label: string }[] = [
  { key: "callsMade", label: "Calls made" },
  { key: "followUps", label: "Follow-ups" },
  { key: "meetings", label: "Meetings" },
  { key: "dealsClosed", label: "Deals closed" },
  { key: "outboundReach", label: "Outbound reach" },
  { key: "discoveryDemos", label: "Discovery & demos" },
  { key: "profilesSignups", label: "Profiles & signups" },
];

export type OpenTask = { id: string; title: string; status: TaskStatus };
/** An event the user can still move forward: attend (registered) and/or conduct (organising). */
export type OpenEvent = { eventId: string; name: string; canAttend: boolean; canConduct: boolean };

export function DailyLogDialog({
  showSalesFields,
  openTasks = [],
  openEvents = [],
}: {
  /** Sales counters only for people measured on sales KPIs. */
  showSalesFields: boolean;
  /** The user's own open tasks — they can log work on them and move their status. */
  openTasks?: OpenTask[];
  /** Events they're registered for or organising — ticking one records it for the KPIs. */
  openEvents?: OpenEvent[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ ...INITIAL });
  const [notes, setNotes] = useState("");
  const [worked, setWorked] = useState<Record<string, TaskStatus>>({});
  const [eventChanges, setEventChanges] = useState<Record<string, "ATTENDED" | "CONDUCTED">>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setValues({ ...INITIAL });
    setNotes("");
    setWorked({});
    setEventChanges({});
    setError(null);
  }

  const nothingEntered =
    !notes.trim() &&
    Object.keys(worked).length === 0 &&
    Object.keys(eventChanges).length === 0 &&
    Object.values(values).every((v) => v === 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitDailyLog({
        ...values,
        activitiesHtml: notes || null,
        taskUpdates: Object.entries(worked).map(([taskId, status]) => ({ taskId, status })),
        eventUpdates: Object.entries(eventChanges).map(([eventId, change]) => ({ eventId, change })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Daily update saved");
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg">
          <NotebookPen /> Log daily update
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Today&apos;s update</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-[26px]">
          {showSalesFields && (
            <fieldset className="flex flex-col gap-3.5">
              <legend className="pb-3.5 text-[17px] font-semibold">Sales activity</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-2">
                    <Label htmlFor={f.key} className="text-secondary-foreground">
                      {f.label}
                    </Label>
                    <div className="flex h-12 items-stretch overflow-hidden rounded-[11px] border border-input focus-within:ring-2 focus-within:ring-ring/40">
                      <button
                        type="button"
                        aria-label={`Decrease ${f.label}`}
                        onClick={() => setValues((v) => ({ ...v, [f.key]: Math.max(0, v[f.key] - 1) }))}
                        className="w-11 shrink-0 bg-[#FBFAF7] text-lg text-secondary-foreground transition-colors hover:bg-muted"
                      >
                        −
                      </button>
                      <input
                        id={f.key}
                        type="number"
                        min={0}
                        value={values[f.key]}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: Math.max(0, Number(e.target.value)) }))}
                        className="w-0 min-w-0 flex-1 border-x border-border bg-card text-center font-mono text-[17px] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${f.label}`}
                        onClick={() => setValues((v) => ({ ...v, [f.key]: v[f.key] + 1 }))}
                        className="w-11 shrink-0 bg-[#FBFAF7] text-lg text-secondary-foreground transition-colors hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">These feed your KPIs automatically.</p>
            </fieldset>
          )}

          {openTasks.length > 0 && (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="pb-3.5 text-[17px] font-semibold">Tasks you worked on</legend>
              <div className="flex max-h-64 flex-col gap-2.5 overflow-y-auto">
                {openTasks.map((t) => {
                  const checked = t.id in worked;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "flex min-h-[52px] items-center gap-3 rounded-[11px] border px-3.5 py-2 transition-colors",
                        checked ? "border-primary/40 bg-primary-soft/40" : "border-border"
                      )}
                    >
                      <input
                        type="checkbox"
                        id={`worked-${t.id}`}
                        checked={checked}
                        onChange={(e) =>
                          setWorked((w) => {
                            const next = { ...w };
                            if (e.target.checked) next[t.id] = t.status;
                            else delete next[t.id];
                            return next;
                          })
                        }
                        className="size-4 shrink-0 accent-primary"
                      />
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: STATUS_COLOR[checked ? worked[t.id] : t.status] }}
                      />
                      <label htmlFor={`worked-${t.id}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm font-semibold">
                        {t.title}
                      </label>
                      {checked && (
                        <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
                          <span className="hidden sm:inline">Status</span>
                          <select
                            aria-label={`New status for ${t.title}`}
                            value={worked[t.id]}
                            onChange={(e) => setWorked((w) => ({ ...w, [t.id]: e.target.value as TaskStatus }))}
                            className="h-9 rounded-lg border border-input bg-card px-2 text-[13px] text-foreground"
                          >
                            {TASK_STATUSES.filter((s) => s !== "PENDING_APPROVAL").map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">Tick what you worked on and set where each task stands now.</p>
            </fieldset>
          )}

          {openEvents.length > 0 && (
            <fieldset className="flex flex-col gap-2.5">
              <legend className="pb-3.5 text-[17px] font-semibold">Events</legend>
              <div className="flex max-h-52 flex-col gap-2.5 overflow-y-auto">
                {openEvents.map((e) => (
                  <div key={e.eventId} className="flex min-h-[52px] items-center gap-3 rounded-[11px] border border-border px-3.5 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.name}</span>
                    <select
                      aria-label={`What happened with ${e.name}`}
                      value={eventChanges[e.eventId] ?? ""}
                      onChange={(ev) =>
                        setEventChanges((c) => {
                          const next = { ...c };
                          if (ev.target.value) next[e.eventId] = ev.target.value as "ATTENDED" | "CONDUCTED";
                          else delete next[e.eventId];
                          return next;
                        })
                      }
                      className="h-9 shrink-0 rounded-lg border border-input bg-card px-2 text-[13px]"
                    >
                      <option value="">—</option>
                      {e.canAttend && <option value="ATTENDED">Attended today</option>}
                      {e.canConduct && <option value="CONDUCTED">Conducted today</option>}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Counts toward Events Attended / Conducted.</p>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="daily-log-notes" className="text-[17px]">
              {showSalesFields ? "Notes & other activities" : "What did you work on?"}
            </Label>
            <Textarea
              id="daily-log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What moved today, what’s blocked, anything the team should know"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="border-t border-[#EFEDE6] pt-4">
          <Button type="button" onClick={submit} disabled={isPending || nothingEntered} className="h-[46px] px-[22px]">
            {isPending && <Loader2 className="animate-spin" />}
            Submit update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
