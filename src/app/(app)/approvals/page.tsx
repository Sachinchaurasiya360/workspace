import Link from "next/link";
import { redirect } from "next/navigation";
import type { ApprovalStatus } from "@prisma/client";

import { ApprovalQueue } from "@/components/approvals/approval-queue";
import { Badge } from "@/components/ui/badge";
import { canManageAll } from "@/lib/access";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_VARIANT } from "@/lib/approval-constants";
import { loadApprovals } from "@/lib/approval-data";
import { getCurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

const HISTORY_FILTERS: { value: ApprovalStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Withdrawn" },
];

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/logout");
  const isAdmin = canManageAll(user);
  const params = await searchParams;
  const historyStatus =
    params.status === "APPROVED" || params.status === "REJECTED" || params.status === "CANCELLED" ? params.status : "";

  const scope = isAdmin ? {} : { requestedById: user.id };
  const [open, history] = await Promise.all([
    loadApprovals({ ...scope, status: { in: ["REQUEST_RAISED", "DISCUSS"] } }),
    loadApprovals({ ...scope, status: historyStatus ? historyStatus : { in: ["APPROVED", "REJECTED", "CANCELLED"] } }, 100),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">Task completions and event attendance</span>
        <h1 className="font-display text-[34px] sm:text-[44px]">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Paid-event and task-completion requests waiting on a founder or admin."
            : "Your paid-event and task-completion requests and their outcome."}
        </p>
      </div>

      <section aria-label={isAdmin ? "Needs a decision" : "Open requests"}>
        <ApprovalQueue approvals={open} canReview={isAdmin} layout="split" />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold">History</h2>
          <nav aria-label="Filter history" className="flex gap-6 overflow-x-auto border-b border-border">
            {HISTORY_FILTERS.map((f) => {
              const active = historyStatus === f.value;
              return (
                <Link
                  key={f.label}
                  href={f.value ? `/approvals?status=${f.value}` : "/approvals"}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-11 shrink-0 items-center border-b-2 text-sm transition-colors",
                    active
                      ? "border-foreground font-semibold text-foreground"
                      : "border-transparent font-medium text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {history.length === 0 && <p className="text-sm text-muted-foreground">No decided requests yet.</p>}
        <ol className="flex flex-col">
          {history.map((a) => (
            <li
              key={a.id}
              className="flex min-h-[52px] flex-col gap-1.5 border-b border-[#EFEDE6] py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-semibold">{a.task?.title ?? a.event?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? `${a.requestedBy?.name ?? "Deleted user"} · ` : ""}
                  {a.type === "TASK_COMPLETION" ? "Task completion" : "Paid event"} · decided{" "}
                  {a.resolvedAt ? formatDate(a.resolvedAt) : "—"}
                  {a.approvedBy ? ` by ${a.approvedBy.name}` : ""}
                </p>
                {a.comment && <p className="text-xs text-muted-foreground italic">“{a.comment}”</p>}
              </div>
              <Badge variant={APPROVAL_STATUS_VARIANT[a.status]}>{APPROVAL_STATUS_LABEL[a.status]}</Badge>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
