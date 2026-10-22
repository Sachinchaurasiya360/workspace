import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { ChangePasswordForm, ProfileDetailsForm } from "@/components/profile/profile-forms";
import { Button } from "@/components/ui/button";
import { ALL_ACCESS_OPTIONS } from "@/lib/access-labels";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { involvedProjectsWhere } from "@/lib/visibility";
import { formatDate } from "@/lib/format";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export default async function ProfilePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/logout");

  const [profile, assigned, completed, projects, dailyUpdates] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: current.id },
      select: { name: true, email: true, phone: true, role: true, access: true, isFounder: true, createdAt: true },
    }),
    db.task.count({ where: { assigneeId: current.id } }),
    db.task.count({ where: { assigneeId: current.id, status: "COMPLETED" } }),
    db.project.count({ where: involvedProjectsWhere(current.id) }),
    db.dailyLog.count({ where: { userId: current.id } }),
  ]);
  const access = ALL_ACCESS_OPTIONS.find((o) => o.value === profile.access)!;
  const memberSince = formatDate(profile.createdAt, { day: "numeric", month: "short", year: "numeric" });

  const activity = [
    { label: "Tasks assigned", value: assigned },
    { label: "Tasks completed", value: completed },
    { label: "Projects involved in", value: projects },
    { label: "Daily updates logged", value: dailyUpdates },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-[20px] border border-border bg-card p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
        <div className="flex size-[72px] shrink-0 items-center justify-center rounded-full bg-[#D5EFE4] font-serif text-[28px] font-semibold text-[#135C40] sm:size-[88px] sm:text-[34px]">
          {initials(profile.name)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h1 className="font-display text-[34px] sm:text-[38px]">{profile.name}</h1>
          <span className="text-sm break-words text-muted-foreground">
            {profile.role} · {profile.email} · Joined {memberSince}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {profile.isFounder && (
            <span className="rounded-xl bg-foreground px-3 py-1.5 text-[13px] font-semibold text-background">Founder</span>
          )}
          <span
            className="rounded-xl bg-primary-soft px-3 py-1.5 text-[13px] font-semibold text-primary-strong"
            title={access.description}
          >
            {access.label} access
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Your details</h2>
          <ProfileDetailsForm name={profile.name} phone={profile.phone} email={profile.email} />
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-[17px] font-semibold">Change password</h2>
          <ChangePasswordForm />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 md:col-span-2 xl:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-semibold">Your activity</h2>
            <span className="text-[13px] text-muted-foreground">All time</span>
          </div>
          <dl className="flex flex-col">
            {activity.map((a) => (
              <div key={a.label} className="flex h-9 items-center justify-between border-b border-[#EFEDE6]">
                <dt className="text-sm text-secondary-foreground">{a.label}</dt>
                <dd className="font-mono text-sm">{a.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-1 pt-2">
            <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">Access</span>
            <span className="text-sm">
              {access.label} — {access.description}
            </span>
          </div>
        </section>
      </div>

      <div className="flex justify-end">
        <form action={signOutAction}>
          <Button type="submit" variant="outline" className="h-11 text-destructive hover:text-destructive">
            <LogOut /> Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
