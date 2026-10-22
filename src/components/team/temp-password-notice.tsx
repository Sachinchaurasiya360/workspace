"use client";

import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";

import { Button } from "@/components/ui/button";

function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Copies email + temporary password together; sits in the dialog footer next to "Done". */
export function CopyDetailsButton({ email, password }: { email: string; password: string }) {
  return (
    <CopyButton
      text={`Email: ${email}\nTemporary password: ${password}`}
      label="Copy both"
      className="h-11 px-4 text-sm"
    />
  );
}

/** Shown once after creating a member or resetting a password — it can't be retrieved later. */
export function TempPasswordNotice({ email, password }: { email: string; password: string }) {
  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Share these sign-in details with the member. They&apos;ll be asked to set their own password when they first
        sign in.
      </p>
      <div className="overflow-hidden rounded-[14px] border border-border">
        <div className="flex items-center gap-3 border-b border-[#EFEDE6] px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-xs font-semibold text-muted-foreground">Email</span>
            <span className="text-[15px] break-all">{email}</span>
          </div>
          <CopyButton text={email} label="Copy" />
        </div>
        <div className="flex items-center gap-3 bg-[#FBFAF7] px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-xs font-semibold text-muted-foreground">Temporary password</span>
            <span className="font-mono text-lg tracking-[0.04em] break-all">{password}</span>
          </div>
          <CopyButton text={password} label="Copy" />
        </div>
      </div>
      <div className="flex gap-2.5 rounded-xl bg-warning-soft px-3.5 py-3 text-[13px] leading-normal text-warning-foreground">
        <Info className="size-[18px] shrink-0" />
        <span>
          This password is shown only once. If it&apos;s lost, use <strong className="font-semibold">Reset password</strong> on
          the Team page.
        </span>
      </div>
    </div>
  );
}
