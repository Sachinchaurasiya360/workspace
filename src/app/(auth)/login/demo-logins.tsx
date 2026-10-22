"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical } from "lucide-react";

import { ACCESS_LABEL } from "@/lib/access-labels";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";

// TEMPORARY — testing only; remove together with src/lib/demo-accounts.ts.
export function DemoLogins({ onPick }: { onPick: (email: string, password: string) => void }) {
  return (
    <section
      aria-labelledby="demo-logins-title"
      className="flex flex-col gap-3 rounded-[14px] border border-dashed border-[#EFD9A8] bg-warning-soft p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id="demo-logins-title" className="flex items-center gap-2 text-[13px] font-semibold text-warning-foreground">
          <FlaskConical className="size-4" />
          Demo logins — for testing only
        </h3>
        <p className="text-xs leading-normal text-warning-foreground/80">
          All data in this workspace is demo data. This section will be removed and the database cleaned once
          the team starts using it. Click an account to fill in the sign-in form.
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.email}>
            <button
              type="button"
              onClick={() => onPick(account.email, DEMO_PASSWORD)}
              className="flex w-full flex-col items-start gap-0.5 rounded-[10px] border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="text-[13px] font-semibold text-foreground">
                {ACCESS_LABEL[account.access]}
                {account.isFounder && " · Founder"}
              </span>
              <span className="w-full truncate text-xs text-muted-foreground">{account.email}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-warning-foreground/80">
          Password for all: <span className="font-mono font-medium text-warning-foreground">{DEMO_PASSWORD}</span>
        </p>
        <Link
          href="/roles"
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-strong"
        >
          What can each role access?
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}
