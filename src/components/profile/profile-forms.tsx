"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { changePassword, updateProfile } from "@/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toastResult } from "@/lib/toast-result";

export function ProfileDetailsForm({
  name: initialName,
  phone: initialPhone,
  email,
}: {
  name: string;
  phone: string | null;
  email: string;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [isPending, startTransition] = useTransition();
  const dirty = name !== initialName || phone !== (initialPhone ?? "");

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          toastResult(await updateProfile({ name, phone: phone || null }), "Profile updated");
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">Full name</Label>
        <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-phone">Contact number</Label>
        <Input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          placeholder="+91 98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold">Email</span>
        <span className="flex min-h-11 items-center rounded-[11px] bg-background px-3 text-sm break-all text-muted-foreground">
          {email}
        </span>
        <span className="text-xs text-muted-foreground">Only an admin can change your email, role or access.</span>
      </div>
      <Button type="submit" className="mt-auto h-11" disabled={isPending || !dirty || !name.trim()}>
        {isPending && <Loader2 className="animate-spin" />}
        Save changes
      </Button>
    </form>
  );
}

function PasswordInput({ id, label, value, onChange, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const ok = toastResult(await changePassword({ currentPassword, newPassword, confirmPassword }), "Password changed");
          if (ok) {
            setCurrent("");
            setNew("");
            setConfirm("");
          }
        });
      }}
    >
      <PasswordInput id="current-password" label="Current password" value={currentPassword} onChange={setCurrent} autoComplete="current-password" />
      <PasswordInput id="new-password" label="New password" value={newPassword} onChange={setNew} autoComplete="new-password" />
      <PasswordInput id="confirm-password" label="Confirm new password" value={confirmPassword} onChange={setConfirm} autoComplete="new-password" />
      <p className={mismatch ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {mismatch ? "Passwords don't match." : "At least 8 characters."}
      </p>
      <Button
        type="submit"
        variant="outline"
        className="mt-auto h-11"
        disabled={isPending || !currentPassword || newPassword.length < 8 || mismatch}
      >
        {isPending && <Loader2 className="animate-spin" />}
        Update password
      </Button>
    </form>
  );
}
