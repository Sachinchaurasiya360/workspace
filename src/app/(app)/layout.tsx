import { redirect } from "next/navigation";

import { NavSidebar } from "@/components/nav-sidebar";
import { canManageAll, hasSalesAccess } from "@/lib/access";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { db } from "@/lib/db";
import { getRecentNotifications, getUnreadCount } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  // The database is the source of truth: an admin's password reset forces a
  // new password even for a session that was already signed in.
  if (user.mustChangePassword) redirect("/set-password");

  const isAdmin = canManageAll(user);
  const [notifications, unreadCount, pendingApprovals] = await Promise.all([
    getRecentNotifications(user.id),
    getUnreadCount(user.id),
    isAdmin ? db.approval.count({ where: { status: { in: ["REQUEST_RAISED", "DISCUSS"] } } }) : Promise.resolve(0),
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NavSidebar
        user={{
          name: user.name,
          email: user.email,
          accessLabel: user.isFounder ? `Founder · ${ACCESS_LABEL[user.access]}` : ACCESS_LABEL[user.access],
        }}
        canManageAll={isAdmin}
        showLeads={isAdmin || hasSalesAccess(user)}
        pendingApprovals={pendingApprovals}
        notifications={notifications}
        unreadCount={unreadCount}
      />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:pt-9 lg:pb-12">{children}</div>
      </main>
    </div>
  );
}
