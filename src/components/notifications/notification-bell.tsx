"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Bell } from "lucide-react";

import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NotificationEntry = {
  id: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date | string;
};

const POLL_MS = 30_000;

type Snapshot = { notifications: NotificationEntry[]; unreadCount: number };

/**
 * Keeps notifications live: polls /api/notifications every 30s while the tab
 * is visible and toasts anything new. Server-rendered data (after navigation
 * or a revalidating action) always wins over an older poll result.
 * Use once per page and pass the result to every bell.
 */
export function useLiveNotifications(initial: Snapshot): Snapshot {
  const router = useRouter();
  const [polled, setPolled] = useState<(Snapshot & { basis: Snapshot }) | null>(null);
  const seen = useRef(new Set(initial.notifications.map((n) => n.id)));

  useEffect(() => {
    for (const n of initial.notifications) seen.current.add(n.id);
  }, [initial]);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || stopped) return;
        const data = (await res.json()) as Snapshot;
        const fresh = data.notifications.filter((n) => !seen.current.has(n.id) && !n.isRead);
        for (const n of data.notifications) seen.current.add(n.id);
        for (const n of fresh.slice(0, 3).reverse()) {
          toast(n.message, n.link ? { action: { label: "Open", onClick: () => router.push(n.link!) } } : undefined);
        }
        setPolled({ ...data, basis: initial });
      } catch {
        // Offline or signed out — try again next tick.
      }
    }
    const timer = window.setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, initial]);

  // A poll only counts while it's newer than the server data it was taken against.
  return polled && polled.basis === initial ? polled : initial;
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationEntry[];
  unreadCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleOpenNotification(n: NotificationEntry) {
    if (!n.isRead) {
      startTransition(async () => {
        await markNotificationRead(n.id);
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative rounded-[11px] border-border text-foreground"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[18px] p-0 sm:max-w-[440px] [&>button:last-child]:top-3 [&>button:last-child]:right-3">
        <DialogHeader className="min-h-16 flex-row items-center justify-between gap-2 border-b border-[#EFEDE6] py-3 pr-16 pl-5">
          <DialogTitle className="flex items-center gap-2 font-sans text-[17px] font-semibold tracking-normal">
            Notifications
            {unreadCount > 0 && (
              <span className="rounded-[10px] bg-primary-soft px-2 py-[3px] text-xs font-semibold text-primary-strong">
                {unreadCount} new
              </span>
            )}
          </DialogTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary hover:text-primary-strong"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await markAllNotificationsRead();
                })
              }
            >
              Mark all read
            </Button>
          )}
        </DialogHeader>

        <div className="flex max-h-[min(28rem,70vh)] flex-col overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          )}
          {notifications.map((n) => {
            const content = (
              <div
                className={cn(
                  "flex gap-3 border-b border-[#EFEDE6] px-5 py-3.5 transition-colors hover:bg-muted/50",
                  !n.isRead && "bg-[#F7F8FD]"
                )}
              >
                <span
                  aria-hidden
                  className={cn("mt-[7px] size-2 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary")}
                />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <span className="text-sm leading-[1.45] break-words text-foreground">
                    {n.message}
                    {!n.isRead && <span className="sr-only"> (unread)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(new Date(n.createdAt))}</span>
                </div>
              </div>
            );
            return n.link ? (
              <Link
                key={n.id}
                href={n.link}
                className="block [&:last-child>div]:border-b-0"
                onClick={() => {
                  handleOpenNotification(n);
                  // Following a notification closes the panel.
                  setOpen(false);
                }}
              >
                {content}
              </Link>
            ) : (
              <button
                key={n.id}
                onClick={() => handleOpenNotification(n)}
                className="block w-full text-left [&:last-child>div]:border-b-0"
              >
                {content}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
