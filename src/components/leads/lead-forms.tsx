"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { createLead, deleteLead, logLeadActivity, updateLead } from "@/actions/leads";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_ACTIVITY_LABEL, LEAD_STAGES, LEAD_STAGE_LABEL } from "@/lib/lead-constants";
import { toastResult } from "@/lib/toast-result";
import type { LeadActivityType, LeadStage } from "@prisma/client";

type LeadRecord = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  value: number | null;
  source: string | null;
  nextFollowUp: Date | string | null;
  notes: string | null;
  ownerId: string;
  projectId?: string | null;
};

function leadFormState(lead: LeadRecord | undefined) {
  return {
    name: lead?.name ?? "",
    company: lead?.company ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    stage: lead?.stage ?? ("NEW" as LeadStage),
    value: lead?.value?.toString() ?? "",
    source: lead?.source ?? "",
    nextFollowUp: dateValue(lead?.nextFollowUp),
    notes: lead?.notes ?? "",
    ownerId: lead?.ownerId ?? "",
    projectId: lead?.projectId ?? "",
  };
}

function dateValue(v: Date | string | null | undefined) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function LeadFormDialog({
  mode,
  lead,
  owners,
  projects = [],
  trigger,
}: {
  mode: "create" | "edit";
  lead?: LeadRecord;
  /** Projects the user can see, for linking the lead to an initiative. */
  projects?: { id: string; name: string }[];
  /** Present for admins, who may assign a lead to any sales member. */
  owners?: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => leadFormState(lead));
  const [isPending, startTransition] = useTransition();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function submit() {
    startTransition(async () => {
      const payload = {
        ...form,
        value: form.value === "" ? null : Number(form.value),
        nextFollowUp: form.nextFollowUp || null,
        ownerId: owners && form.ownerId ? form.ownerId : null,
        projectId: form.projectId || null,
      };
      const result = mode === "create" ? await createLead(payload) : await updateLead({ id: lead!.id, ...payload });
      if (toastResult(result, mode === "create" ? "Lead added" : "Lead saved")) setOpen(false);
    });
  }

  function remove() {
    if (!lead || !confirm(`Delete lead "${lead.name}"? Its activity history goes too.`)) return;
    startTransition(async () => {
      if (toastResult(await deleteLead(lead.id), "Lead deleted")) {
        setOpen(false);
        router.push("/leads");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Always start from the lead's current values (stage may have
        // auto-advanced since mount) — or a blank form for a new lead.
        if (next) setForm(leadFormState(lead));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="lg">
            <Plus /> Add lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-[660px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add lead" : `Edit ${lead?.name}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-name">Contact name</Label>
              <Input id="lead-name" value={form.name} onChange={set("name")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" value={form.company} onChange={set("company")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" value={form.email} onChange={set("email")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" type="tel" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v as LeadStage }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STAGE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-value">Deal value (₹)</Label>
              <Input id="lead-value" type="number" min={0} value={form.value} onChange={set("value")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-source">Source</Label>
              <Input id="lead-source" value={form.source} onChange={set("source")} placeholder="Event, referral, inbound…" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-follow">Next follow-up</Label>
              <Input id="lead-follow" type="date" value={form.nextFollowUp} onChange={set("nextFollowUp")} />
            </div>
          </div>
          {owners && (
            <div className="flex flex-col gap-2">
              <Label>Owner</Label>
              <Select value={form.ownerId || "me"} onValueChange={(v) => setForm((f) => ({ ...f, ownerId: v === "me" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mode === "create" && <SelectItem value="me">Me</SelectItem>}
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {projects.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              <Select
                value={form.projectId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-notes">Notes</Label>
            <Textarea id="lead-notes" rows={3} value={form.notes} onChange={set("notes")} />
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
            {mode === "create" ? "Add lead" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ACTIVITY_TYPES: LeadActivityType[] = ["CALL", "FOLLOW_UP", "MEETING", "NOTE"];

export function LogLeadActivityForm({ leadId }: { leadId: string }) {
  const [type, setType] = useState<LeadActivityType>("CALL");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-muted bg-sidebar p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          if (toastResult(await logLeadActivity({ leadId, type, note }), `${LEAD_ACTIVITY_LABEL[type]} logged`)) setNote("");
        });
      }}
    >
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Activity type">
        {ACTIVITY_TYPES.map((t) => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={t === type ? "secondary" : "outline"}
            className={t === type ? undefined : "font-medium"}
            onClick={() => setType(t)}
            aria-pressed={t === type}
          >
            {LEAD_ACTIVITY_LABEL[t]}
          </Button>
        ))}
      </div>
      <Textarea
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What happened? Next steps?"
        aria-label="What happened"
        className="bg-card"
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || (type === "NOTE" && !note.trim())}>
          {isPending && <Loader2 className="animate-spin" />}
          Log {LEAD_ACTIVITY_LABEL[type].toLowerCase()}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Lead activity is your record per prospect. Your daily update is still what counts toward KPIs.
      </p>
    </form>
  );
}
