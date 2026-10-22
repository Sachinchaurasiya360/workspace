import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export type ActivityItem = {
  id: string;
  actorName: string;
  text: string;
  href: string | null;
  createdAt: Date | string;
};

export function timeAgo(value: Date | string, now = new Date()) {
  const seconds = Math.round((now.getTime() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(new Date(value));
}

/** Latest-first list of workspace events: "<actor> <did something>" · when. */
export function ActivityList({ items, compact }: { items: ActivityItem[]; compact?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No activity yet.</p>;

  return (
    <ol className={cn("flex flex-col", compact && "gap-1.5")}>
      {items.map((item) => {
        const body = (
          <>
            <span className="font-semibold text-foreground">{item.actorName}</span>{" "}
            <span className={compact ? "text-muted-foreground" : "text-secondary-foreground"}>{item.text}</span>
          </>
        );
        return (
          <li
            key={item.id}
            className={cn(
              "flex gap-3",
              compact
                ? "items-start text-xs"
                : "items-start border-b border-[#EFEDE6] py-[15px] text-sm leading-[1.45] last:border-b-0"
            )}
          >
            {!compact && <span aria-hidden className="mt-[7px] size-2 shrink-0 rounded-full bg-primary/60" />}
            <p className="min-w-0 flex-1 break-words">
              {item.href ? (
                <Link href={item.href} className="hover:underline">
                  {body}
                </Link>
              ) : (
                body
              )}
            </p>
            {/* Relative time can tick over between server render and hydration. */}
            <time
              className={cn("shrink-0 text-xs text-muted-foreground", !compact && "pt-px")}
              dateTime={new Date(item.createdAt).toISOString()}
              suppressHydrationWarning
            >
              {timeAgo(item.createdAt)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
