import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, Minus } from "lucide-react";
import type { AccessLevel } from "@prisma/client";

import { canManageAll, hasSalesAccess, hasTaskAccess } from "@/lib/access";
import { ACCESS_OPTIONS } from "@/lib/access-labels";
import { KPI_LABEL, kpisForAccess } from "@/lib/kpi-constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roles & access · Nucleo",
};

// Everything below is derived from the same helpers the app uses to gate
// pages and actions (lib/access.ts, lib/kpi-constants.ts), so this guide
// can't drift from real behaviour.
const asUser = (access: AccessLevel) => ({ id: "", isFounder: false, access });

function dashboardFor(access: AccessLevel) {
  const user = asUser(access);
  const admin = canManageAll(user);
  const sales = hasSalesAccess(user);
  const task = hasTaskAccess(user);
  const own = sales && task ? "Sales + task dashboard" : sales ? "Sales dashboard" : "Task dashboard";
  if (admin) return sales || task ? `Team overview + own ${own.toLowerCase()}` : "Team overview only";
  return own;
}

type Capability = { label: string; detail: string; allowed: (access: AccessLevel) => boolean };

const CAPABILITIES: Capability[] = [
  {
    label: "See everyone's tasks & projects",
    detail: "Otherwise: only tasks assigned to or created by you, and projects you lead or belong to.",
    allowed: (a) => canManageAll(asUser(a)),
  },
  {
    label: "Own tasks & KPI",
    detail: "Measured on tasks completed.",
    allowed: (a) => hasTaskAccess(asUser(a)),
  },
  {
    label: "Sales KPIs & sales fields in daily updates",
    detail: "Calls, follow-ups, meetings, demos, profiles, deals, events.",
    allowed: (a) => hasSalesAccess(asUser(a)),
  },
  {
    label: "Leads module",
    detail: "Lead pipeline, lead pages and lead search.",
    allowed: (a) => canManageAll(asUser(a)) || hasSalesAccess(asUser(a)),
  },
  {
    label: "Add events",
    detail: "Everyone can browse events and request to attend.",
    allowed: (a) => canManageAll(asUser(a)) || hasSalesAccess(asUser(a)),
  },
  {
    label: "Review approvals",
    detail: "Approve, discuss or reject task completions and paid-event requests.",
    allowed: (a) => canManageAll(asUser(a)),
  },
  {
    label: "Team & Reports",
    detail: "Add/edit members, reset passwords, set KPI targets, view any dashboard, export CSVs.",
    allowed: (a) => canManageAll(asUser(a)),
  },
];

export default function RolesPage() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/icon-mark.png" alt="" width={34} height={34} className="size-[34px]" />
            <span className="font-serif text-[22px] font-semibold tracking-[-0.01em]">Nucleo</span>
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-2 rounded-[11px] border border-input bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted-foreground">
            {ACCESS_OPTIONS.length} access levels
          </span>
          <h1 className="font-display text-[34px] sm:text-[44px]">Roles &amp; access</h1>
          <p className="max-w-[640px] text-[15px] leading-normal text-muted-foreground">
            Each team member has one access level. It decides which dashboard they land on, what they can see,
            and which KPIs they&rsquo;re measured on. Admins set it on the Team page.
          </p>
        </div>
      </header>

      {/* Matrix — scrolls sideways inside its card on narrow screens */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="bg-sidebar text-left">
                <th scope="col" className="sticky left-0 w-[260px] bg-sidebar px-5 py-3 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  What they can do
                </th>
                {ACCESS_OPTIONS.map((o) => (
                  <th key={o.value} scope="col" className="px-3 py-3 text-center text-[13px] font-semibold">
                    {o.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap) => (
                <tr key={cap.label} className="border-t border-[#EFEDE6]">
                  <th scope="row" className="sticky left-0 bg-card px-5 py-3.5 text-left align-top font-normal">
                    <span className="block font-semibold">{cap.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{cap.detail}</span>
                  </th>
                  {ACCESS_OPTIONS.map((o) => {
                    const ok = cap.allowed(o.value);
                    return (
                      <td key={o.value} className="px-3 py-3.5 text-center">
                        <span
                          className={cn(
                            "inline-flex size-7 items-center justify-center rounded-full",
                            ok ? "bg-[#d5efe4] text-[#135c40]" : "text-[#b7b6ae]"
                          )}
                        >
                          {ok ? <Check className="size-4" aria-hidden /> : <Minus className="size-4" aria-hidden />}
                          <span className="sr-only">{ok ? "Yes" : "No"}</span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* One card per access level */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ACCESS_OPTIONS.map((o) => {
          const kpis = kpisForAccess(o.value);
          return (
            <article key={o.value} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                  {canManageAll(asUser(o.value)) ? "Admin access" : "Member access"}
                </span>
                <h2 className="text-[17px] font-semibold">{o.label}</h2>
                <p className="text-[13px] text-muted-foreground">{o.description}</p>
              </div>
              <dl className="flex flex-col gap-3 border-t border-[#EFEDE6] pt-4 text-[13px]">
                <div className="flex flex-col gap-0.5">
                  <dt className="font-semibold text-muted-foreground">Lands on</dt>
                  <dd>{dashboardFor(o.value)}</dd>
                </div>
                <div className="flex flex-col gap-1.5">
                  <dt className="font-semibold text-muted-foreground">KPIs measured on</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {kpis.length === 0 ? (
                      <span className="text-muted-foreground">None — oversight only</span>
                    ) : (
                      kpis.map((k) => (
                        <span key={k} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          {KPI_LABEL[k]}
                        </span>
                      ))
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Founder flag</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Founder is a flag on top of any access level and always gets full admin rights. Only a founder can
            edit, deactivate or delete another founder, mark someone as a founder, or change their own access level.
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Everyone, whatever their level</h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Can edit tasks they&rsquo;re assigned to or created, manage projects they lead, log daily updates,
            browse and respond to events, comment, and see their own activity and notifications. For non-admins,
            marking a task complete sends it to an admin for approval before it counts, and registering for a
            paid event needs approval first.
          </p>
        </div>
      </section>
    </div>
  );
}
