"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

import { addTeamMember } from "@/actions/team";
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
import type { AccessLevel } from "@prisma/client";

const ACCESS_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "TASK_BASED", label: "Task based" },
  { value: "SALES_BASED", label: "Sales based" },
  { value: "ADMIN", label: "Admin" },
  { value: "ADMIN_TASK_BASED", label: "Admin + Task based" },
  { value: "SALES_TASK_BASED", label: "Sales based + Task based" },
];

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [access, setAccess] = useState<AccessLevel>("TASK_BASED");
  const [isFounder, setIsFounder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await addTeamMember({ name, email, role, access, isFounder });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setName("");
      setEmail("");
      setRole("");
      setAccess("TASK_BASED");
      setIsFounder(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-name">Name</Label>
            <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-role">Role</Label>
            <Input id="member-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Venture Success Associate" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Access</Label>
            <Select value={access} onValueChange={(v) => setAccess(v as AccessLevel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isFounder} onChange={(e) => setIsFounder(e.target.checked)} />
            Founder
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending || !name.trim() || !email.trim() || !role.trim()}>
            {isPending && <Loader2 className="animate-spin" />}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
