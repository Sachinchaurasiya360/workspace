"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTeamMember, resetMemberPassword, updateTeamMember } from "@/actions/team";
import { AccessSelect } from "@/components/team/add-member-dialog";
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
import { toastResult } from "@/lib/toast-result";
import type { AccessLevel } from "@prisma/client";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  access: AccessLevel;
  isFounder: boolean;
  isActive: boolean;
  /** What they own — decides whether deleting needs someone to take over. */
  owned: { tasks: number; leads: number; projects: number };
};

type View = "edit" | "password" | "delete";

export function EditMemberDialog({
  member,
  people,
  viewer,
}: {
  member: Member;
  /** Active members who could take over this member's work. */
  people: { id: string; name: string }[];
  viewer: { id: string; isFounder: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("edit");
  const [form, setForm] = useState(() => formFrom(member));
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [heir, setHeir] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [isPending, startTransition] = useTransition();

  const isSelf = member.id === viewer.id;
  const canTouchFounder = viewer.isFounder;
  const locked = member.isFounder && !canTouchFounder;
  const ownsWork = member.owned.tasks + member.owned.leads + member.owned.projects > 0;
  const heirs = people.filter((p) => p.id !== member.id);

  function handleOpenChange(next: boolean) {
    if (next) {
      setForm(formFrom(member));
      setView("edit");
      setTempPassword(null);
      setHeir("");
      setConfirmName("");
    }
    setOpen(next);
  }

  function save() {
    startTransition(async () => {
      const result = await updateTeamMember({ id: member.id, ...form, phone: form.phone || null });
      if (toastResult(result, "Member updated")) setOpen(false);
    });
  }

  function resetPassword() {
    if (!confirm(`Reset ${member.name}'s password? They'll be signed out everywhere.`)) return;
    startTransition(async () => {
      const result = await resetMemberPassword(member.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Password reset");
      setTempPassword(result.tempPassword);
      setView("password");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTeamMember({ memberId: member.id, reassignToId: heir || null, confirmName });
      if (toastResult(result, `${member.name} was deleted`)) setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={`Edit ${member.name}`} aria-label={`Edit ${member.name}`}>
          <Pencil className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {view === "delete" ? `Delete ${member.name}?` : view === "password" ? "Password reset" : `Edit ${member.name}`}
          </DialogTitle>
        </DialogHeader>

        {view === "password" && tempPassword && (
          <>
            <TempPasswordNotice email={member.email} password={tempPassword} />
            <DialogFooter className="gap-2.5">
              <CopyDetailsButton email={member.email} password={tempPassword} />
              <Button type="button" className="h-11 px-5" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}

        {view === "delete" && (
          <>
            <div className="flex flex-col gap-4 text-sm">
              <p className="text-muted-foreground">
                This permanently removes their account. Their daily updates, KPI targets, event participation and
                notifications are deleted. Their comments and approval history stay, shown as “Deleted user”.
              </p>
              <p className="text-muted-foreground">
                To keep their records instead, cancel and untick <span className="font-medium text-foreground">Active</span>.
              </p>
              {ownsWork && (
                <div className="flex flex-col gap-2">
                  <Label>
                    Hand over {member.owned.tasks} task{member.owned.tasks === 1 ? "" : "s"}, {member.owned.leads} lead
                    {member.owned.leads === 1 ? "" : "s"} and {member.owned.projects} led project
                    {member.owned.projects === 1 ? "" : "s"} to
                  </Label>
                  <Select value={heir} onValueChange={setHeir}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {heirs.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor={`confirm-${member.id}`}>
                  Type <span className="font-semibold">{member.name}</span> to confirm
                </Label>
                <Input id={`confirm-${member.id}`} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setView("edit")} disabled={isPending} className="sm:mr-auto">
                Back
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={isPending || confirmName.trim() !== member.name || (ownsWork && !heir)}
              >
                {isPending && <Loader2 className="animate-spin" />}
                Delete permanently
              </Button>
            </DialogFooter>
          </>
        )}

        {view === "edit" && (
          <>
            {locked && (
              <p className="rounded-[14px] bg-warning-soft px-[18px] py-3.5 text-[13px] text-warning-foreground">
                Only a founder can edit a founder&apos;s account.
              </p>
            )}
            <fieldset disabled={locked || isPending} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`name-${member.id}`}>Name</Label>
                  <Input id={`name-${member.id}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`phone-${member.id}`}>Contact number</Label>
                  <Input
                    id={`phone-${member.id}`}
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`role-${member.id}`}>Role</Label>
                <Input id={`role-${member.id}`} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
              </div>
              <AccessSelect value={form.access} onChange={(access) => setForm((f) => ({ ...f, access }))} />
              <div className="flex flex-col gap-3 text-sm">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-[18px] shrink-0 accent-foreground"
                    checked={form.isFounder}
                    disabled={!canTouchFounder}
                    onChange={(e) => setForm((f) => ({ ...f, isFounder: e.target.checked }))}
                  />
                  Founder{!canTouchFounder && <span className="text-xs text-muted-foreground">(founders only)</span>}
                </label>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="size-[18px] shrink-0 accent-foreground"
                    checked={form.isActive}
                    disabled={isSelf}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Active (unticking signs them out and blocks sign-in immediately)
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Email: {member.email}</p>
            </fieldset>
            <DialogFooter className="flex-wrap gap-2 border-t border-[#EFEDE6] pt-3.5">
              {!locked && !isSelf && (
                <Button type="button" variant="ghost" onClick={() => setView("delete")} disabled={isPending} className="text-destructive sm:mr-auto">
                  <Trash2 /> Delete member
                </Button>
              )}
              {!locked && (
                <Button type="button" variant="outline" onClick={resetPassword} disabled={isPending}>
                  <KeyRound /> Reset password
                </Button>
              )}
              <Button type="button" onClick={save} disabled={locked || isPending || !form.name.trim() || !form.role.trim()}>
                {isPending && <Loader2 className="animate-spin" />}
                Save changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formFrom(member: Member) {
  return {
    name: member.name,
    role: member.role,
    phone: member.phone ?? "",
    access: member.access,
    isFounder: member.isFounder,
    isActive: member.isActive,
  };
}
