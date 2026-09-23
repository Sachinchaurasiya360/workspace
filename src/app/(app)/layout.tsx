import { redirect } from "next/navigation";

import { NavSidebar } from "@/components/nav-sidebar";
import { auth } from "@/lib/auth";
import { canManageAll } from "@/lib/access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-background">
      <NavSidebar
        user={{
          name: session.user.name ?? session.user.email ?? "",
          email: session.user.email ?? "",
          isFounder: session.user.isFounder,
        }}
        canManageAll={canManageAll(session.user)}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
