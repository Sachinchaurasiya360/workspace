"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, KanbanSquare, LayoutDashboard, LogOut, Users } from "lucide-react";

import { signOutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: KanbanSquare },
  { href: "/discovery", label: "Discovery", icon: Compass },
] as const;

type NavSidebarProps = {
  user: { name: string; email: string; isFounder: boolean };
  canManageAll: boolean;
};

export function NavSidebar({ user, canManageAll }: NavSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-5">
        <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
          Nucleo
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}

        {canManageAll && (
          <Link
            href="/team"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
              pathname.startsWith("/team") &&
                "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
            )}
          >
            <Users className="size-4" />
            Team
          </Link>
        )}
      </nav>

      <div className="flex flex-col gap-3 border-t border-sidebar-border p-3">
        <div className="flex flex-col px-2">
          <span className="truncate text-sm font-medium text-sidebar-foreground">
            {user.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
