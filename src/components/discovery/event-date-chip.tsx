import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

/** Calendar-style month/day block used on event cards and the event dialog. */
export function EventDateChip({ date, size = "md", className }: { date: Date | string | null; size?: "md" | "lg"; className?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-px rounded-xl bg-background",
        size === "lg" ? "h-[68px] w-16" : "h-[62px] w-[58px]",
        className
      )}
    >
      {date ? (
        <>
          <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {formatDate(date, { month: "short" })}
          </span>
          <span className={cn("font-mono font-medium", size === "lg" ? "text-2xl" : "text-[22px]")}>
            {formatDate(date, { day: "2-digit" })}
          </span>
        </>
      ) : (
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">TBC</span>
      )}
    </div>
  );
}
