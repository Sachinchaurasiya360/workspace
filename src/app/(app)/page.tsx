import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";

import { AdminOverview } from "@/components/dashboard/admin-overview";
import { PersonalDashboard } from "@/components/dashboard/personal-dashboard";
import { assertDashboardAccess, canManageAll, hasSalesAccess, hasTaskAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { parseKpiPeriod } from "@/lib/kpi-constants";
import { getCurrentUser } from "@/lib/session";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;
  const period = parseKpiPeriod(params.period);
  const viewAs = typeof params.viewAs === "string" ? params.viewAs : null;

  // "View dashboard" mode: an admin looking at one member's dashboard.
  if (viewAs && viewAs !== user.id) {
    try {
      assertDashboardAccess(user, viewAs);
    } catch {
      redirect("/");
    }
    const target = await db.user.findUnique({
      where: { id: viewAs },
      select: { id: true, name: true, role: true, access: true, isFounder: true },
    });
    if (!target) notFound();

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[14px] bg-primary-soft px-[18px] py-3.5 text-[#1F2B6E]">
          <Eye className="size-5 shrink-0" />
          <span className="flex-1 text-sm">
            Viewing <strong className="font-semibold">{target.name}</strong>&apos;s dashboard
          </span>
          <Link href={`/?period=${period}`} className="flex items-center gap-1 text-[13px] font-semibold text-[#1F2B6E] hover:underline">
            <ArrowLeft className="size-3.5" /> Back to team overview
          </Link>
        </div>
        <PersonalDashboard target={target} viewer={user} period={period} query={`viewAs=${target.id}`} />
      </div>
    );
  }

  // Admins with their own task/sales work can switch to their operational dashboard.
  const hasOwnWork = hasTaskAccess(user) || hasSalesAccess(user);
  if (isAdmin && !(params.view === "me" && hasOwnWork)) {
    return <AdminOverview viewer={user} period={period} showMyDashboardLink={hasOwnWork} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <Link href={`/?period=${period}`} className="flex w-fit items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Team overview
        </Link>
      )}
      <PersonalDashboard target={user} viewer={user} period={period} query={isAdmin ? "view=me" : ""} />
    </div>
  );
}
