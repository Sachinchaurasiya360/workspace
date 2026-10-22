"use client";

import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { addTeamMember } from "@/actions/team";
import { CopyDetailsButton, TempPasswordNotice } from "@/components/team/temp-password-notice";
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
import { ACCESS_OPTIONS, LEGACY_ACCESS_OPTIONS } from "@/lib/access-labels";
import type { AccessLevel } from "@prisma/client";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<AccessLevel>("TASK_BASED");
  const [isFounder, setIsFounder] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setName("");
    setEmail("");
    setRole("");
    setPhone("");
    setAccess("TASK_BASED");
    setIsFounder(false);
    setCreated(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await addTeamMember({ name, email, role, phone: phone || null, access, isFounder });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} added to the team`);
      setCreated({ email: email.trim().toLowerCase(), password: result.tempPassword });
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
        <Button className="h-11 px-[18px]">
          <Plus /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className={created ? "gap-3.5" : undefined}>
          {created && (
            <span className="flex size-12 items-center justify-center rounded-full bg-[#D5EFE4] text-[#135C40]">
              <Check className="size-[22px]" strokeWidth={2.25} />
            </span>
          )}
          <DialogTitle>{created ? `${name.trim() || "Member"} has been added` : "Add team member"}</DialogTitle>
        </DialogHeader>

        {created ? (
          <>
            <TempPasswordNotice email={created.email} password={created.password} />
            <DialogFooter className="gap-2.5">
              <CopyDetailsButton email={created.email} password={created.password} />
              <Button type="button" className="h-11 px-5" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="member-name">Name</Label>
                  <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="member-phone">Contact number</Label>
                  <Input id="member-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="member-email">Email</Label>
                <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="member-role">Role</Label>
                <Input
                  id="member-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Software Engineer, Venture Success Associate"
                />
              </div>
              <AccessSelect value={access} onChange={setAccess} />
              <label className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-[18px] accent-foreground"
                  checked={isFounder}
                  onChange={(e) => setIsFounder(e.target.checked)}
                />
                Founder (approves requests, full access)
              </label>
            </div>

            <DialogFooter>
              <Button type="button" className="h-11 px-5" onClick={submit} disabled={isPending || !name.trim() || !email.trim() || !role.trim()}>
                {isPending && <Loader2 className="animate-spin" />}
                Add member
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AccessSelect({ value, onChange }: { value: AccessLevel; onChange: (v: AccessLevel) => void }) {
  // A member still on a retired combined level sees it listed so the select
  // isn't blank, but it can't be picked for anyone else.
  const legacy = ACCESS_OPTIONS.some((o) => o.value === value)
    ? undefined
    : LEGACY_ACCESS_OPTIONS.find((o) => o.value === value);
  const options = legacy ? [...ACCESS_OPTIONS, legacy] : ACCESS_OPTIONS;
  const selected = options.find((o) => o.value === value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Access</Label>
        {/* New tab so the half-filled form isn't lost. */}
        <a
          href="/roles"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-strong"
        >
          Compare roles
          <ExternalLink className="size-3" />
        </a>
      </div>
      <Select value={value} onValueChange={(v) => onChange(v as AccessLevel)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
              {o === legacy && " (retired)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected && <p className="text-xs text-muted-foreground">{selected.description}</p>}
    </div>
  );
}
