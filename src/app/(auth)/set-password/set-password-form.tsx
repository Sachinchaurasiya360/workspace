"use client";

import { useActionState, useState } from "react";
import { Check, Circle, Loader2 } from "lucide-react";

import { setPasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 8;

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5",
        met ? "text-success" : "text-muted-foreground"
      )}
    >
      {met ? (
        <Check className="size-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      ) : (
        <Circle className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      )}
      <span>
        {children}
        <span className="sr-only">{met ? " (met)" : " (not met)"}</span>
      </span>
    </li>
  );
}

export function SetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    setPasswordAction,
    undefined
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const longEnough = password.length >= MIN_LENGTH;
  const matches = password.length > 0 && password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !matches;

  return (
    <form action={formAction} className="flex flex-col gap-[26px]">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 text-[15px]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={showMismatch || undefined}
          aria-describedby={showMismatch ? "confirmPassword-hint" : undefined}
          className="h-12 text-[15px]"
        />
        {showMismatch && (
          <span
            id="confirmPassword-hint"
            className="text-[13px] font-medium text-destructive"
          >
            Passwords don&rsquo;t match yet.
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2.5 rounded-xl bg-background px-[18px] py-4 text-sm">
        <Requirement met={longEnough}>At least {MIN_LENGTH} characters</Requirement>
        <Requirement met={matches}>Both fields match</Requirement>
      </ul>

      {state?.error && (
        <p className="-mt-2.5 text-[13px] font-medium text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        disabled={isPending}
        className="h-[50px] rounded-xl text-[15px]"
      >
        {isPending && <Loader2 className="animate-spin" />}
        Save and continue
      </Button>
    </form>
  );
}
