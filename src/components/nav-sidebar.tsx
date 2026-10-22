"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  CheckSquare,
  ClipboardCheck,
  Compass,
  Handshake,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Search,
  Users,
  X,
} from "lucide-react";

import { signOutAction } from "@/actions/auth";
import {
  NotificationBell,
  useLiveNotifications,
  type NotificationEntry,
} from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

type NavSidebarProps = {
  user: { name: string; email: string; accessLabel: string };
  canManageAll: boolean;
  showLeads: boolean;
  pendingApprovals: number;
  notifications: NotificationEntry[];
  unreadCount: number;
};

export function NavSidebar({
  user,
  canManageAll,
  showLeads,
  pendingApprovals,
  notifications,
  unreadCount,
}: NavSidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // One poller for both bells (mobile bar + sidebar header).
  const initial = useMemo(() => ({ notifications, unreadCount }), [notifications, unreadCount]);
  const live = useLiveNotifications(initial);

  const items = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, show: true },
    { href: "/tasks", label: canManageAll ? "All tasks" : "My tasks", icon: CheckSquare, show: true },
    { href: "/projects", label: "Projects", icon: KanbanSquare, show: true },
    { href: "/discovery", label: "Events", icon: Compass, show: true },
    { href: "/leads", label: "Leads", icon: Handshake, show: showLeads },
    { href: "/daily-updates", label: "Daily updates", icon: NotebookPen, show: true },
    { href: "/approvals", label: "Approvals", icon: ClipboardCheck, show: true, badge: pendingApprovals },
    { href: "/activity", label: "Activity", icon: Activity, show: true },
  ].filter((i) => i.show);
  const adminItems = [
    { href: "/team", label: "Team", icon: Users },
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ];
  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  const linkClass = (active: boolean) =>
    cn(
      "flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-[18px] [&_svg]:shrink-0",
      active && "bg-primary-soft font-semibold text-primary hover:bg-primary-soft hover:text-primary"
    );

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-md p-1.5 hover:bg-muted">
          <Menu className="size-5" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icon-mark.png" alt="" width={26} height={26} className="size-[26px]" />
          <span className="font-serif text-lg font-semibold tracking-[-0.01em]">Nucleo</span>
        </Link>
        <NotificationBell notifications={live.notifications} unreadCount={live.unreadCount} />
      </div>

      {open && <div className="fixed inset-0 z-40 bg-[rgba(23,24,28,0.48)] md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar px-4 py-6 transition-transform md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-2">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
            <Image src="/icon-mark.png" alt="" width={34} height={34} className="size-[34px]" />
            <span className="font-serif text-[22px] font-semibold tracking-[-0.01em] text-sidebar-foreground">Nucleo</span>
          </Link>
          <div className="flex items-center gap-1">
            <span className="hidden md:inline-flex">
              <NotificationBell notifications={live.notifications} unreadCount={live.unreadCount} />
            </span>
            <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-muted md:hidden">
              <X className="size-4" />
            </button>
          </div>
        </div>

        <form action="/search" onSubmit={() => setOpen(false)}>
          <label className="relative block">
            <span className="sr-only">Search the workspace</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#6b6d74]" />
            <input
              name="q"
              type="search"
              placeholder="Search workspace"
              className="h-10 w-full rounded-[10px] border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-[#6b6d74] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
            />
          </label>
        </form>

        {/* Clicking any link closes the mobile drawer. */}
        <nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1" onClick={() => setOpen(false)}>
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={linkClass(active)}>
                <Icon />
                {item.label}
                {!!item.badge && (
                  <span className="ml-auto flex h-5 min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
          {canManageAll && (
            <>
              <span className="px-3 pt-[18px] pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#6b6d74] uppercase">Admin</span>
              {adminItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={linkClass(pathname.startsWith(item.href))}>
                    <Icon />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="flex flex-col gap-1">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-input",
              pathname.startsWith("/profile") && "border-primary/40"
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-[13px] font-semibold text-background">
              {initials}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</span>
              <span className="truncate text-xs text-[#6b6d74]">{user.accessLabel}</span>
            </span>
          </Link>
          <form action={signOutAction}>
            <button type="submit" className={cn(linkClass(false), "w-full")}>
              <LogOut />
              Sign out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
