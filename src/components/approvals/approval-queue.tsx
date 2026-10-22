"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { reviewApproval } from "@/actions/approvals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_STATUS_LABEL, APPROVAL_STATUS_VARIANT } from "@/lib/approval-constants";
import { toastResult } from "@/lib/toast-result";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";

export type ApprovalRow = {
  id: string;
  type: "TASK_COMPLETION" | "EVENT_ATTENDANCE";
  status: ApprovalStatus;
  requestNote: string | null;
  comment: string | null;
  createdAt: Date;
  requestedBy: { name: string } | null;
  task: { title: string; projectId: string | null; project: { name: string } | null; dueDate: Date | null } | null;
  event: {
    name: string;
    date: Date | null;
    city: string | null;
    venue: string | null;
    price: string | null;
    link: string | null;
  } | null;
};

const KIND_LABEL = "text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

const kindOf = (a: ApprovalRow) => (a.type === "TASK_COMPLETION" ? "Task completion" : "Paid event");
const titleOf = (a: ApprovalRow) => a.task?.title ?? a.event?.name;
const requester = (a: ApprovalRow) => a.requestedBy?.name ?? "Deleted user";

/** "Requester · project · due …" or "Requester · date · place · price" — the context under a title. */
function contextParts(a: ApprovalRow, { withLinks }: { withLinks: boolean }): React.ReactNode[] {
  const parts: React.ReactNode[] = [requester(a)];
  if (a.task) {
    const { task } = a;
    if (task.projectId && task.project) {
      parts.push(
        withLinks ? (
          <Link key="project" href={`/projects/${task.projectId}`} className="hover:underline">
            {task.project.name}
          </Link>
        ) : (
          task.project.name
        )
      );
    }
    if (task.dueDate) parts.push(`due ${formatDate(new Date(task.dueDate))}`);
  }
  if (a.event) {
    const { event } = a;
    parts.push(event.date ? formatDate(new Date(event.date), { dateStyle: "medium" }) : "Date TBC");
    const place = [event.venue, event.city].filter(Boolean).join(", ");
    if (place) parts.push(place);
    if (event.price) parts.push(event.price);
  }
  return parts;
}

function joinParts(parts: React.ReactNode[]) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 && " · "}
      {p}
    </span>
  ));
}

/** Full request + decision controls. `compact` is the inline card used on the dashboard queue. */
function ApprovalDetail({
  approval,
  canReview,
  compact,
}: {
  approval: ApprovalRow;
  canReview: boolean;
  compact?: boolean;
}) {
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();
  const { event } = approval;
  const commentId = `approval-comment-${approval.id}`;

  const decide = (decision: "approve" | "reject" | "discuss") =>
    startTransition(async () => {
      const word = decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Marked for discussion";
      if (toastResult(await reviewApproval({ approvalId: approval.id, decision, comment }), word)) setComment("");
    });

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col border border-border bg-card",
        compact ? "gap-3.5 rounded-[14px] px-[18px] py-4" : "gap-[22px] rounded-2xl p-6 sm:p-7"
      )}
    >
      <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={KIND_LABEL}>
            {kindOf(approval)} · requested {formatDate(new Date(approval.createdAt))}
          </span>
          {approval.status !== "REQUEST_RAISED" && (
            <Badge variant={APPROVAL_STATUS_VARIANT[approval.status]}>{APPROVAL_STATUS_LABEL[approval.status]}</Badge>
          )}
        </div>
        {compact ? (
          <h3 className="text-[15px] leading-snug font-semibold break-words">{titleOf(approval)}</h3>
        ) : (
          <h2 className="font-serif text-[26px] leading-tight font-medium tracking-[-0.01em] break-words sm:text-[30px]">
            {titleOf(approval)}
          </h2>
        )}
        <p className={cn("break-words text-muted-foreground", compact ? "text-[13px]" : "text-sm")}>
          {joinParts(contextParts(approval, { withLinks: true }))}
          {event?.link && (
            <>
              {" · "}
              <a
                href={event.link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                Event page <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </p>
      </div>

      {(approval.requestNote || approval.comment) && (
        <div className="flex flex-col gap-2.5">
          {approval.requestNote && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-background px-[18px] py-4">
              <span className="text-xs font-semibold text-muted-foreground">Note from {requester(approval)}</span>
              <p className="text-sm leading-[1.55] break-words whitespace-pre-wrap">{approval.requestNote}</p>
            </div>
          )}
          {approval.comment && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-warning-soft px-[18px] py-4 text-warning-foreground">
              <span className="text-xs font-semibold">Founder comment</span>
              <p className="text-sm leading-[1.55] break-words whitespace-pre-wrap">{approval.comment}</p>
            </div>
          )}
        </div>
      )}

      {canReview && (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={commentId} className="text-[13px] font-semibold">
              Your comment <span className="font-medium text-muted-foreground">(shown to {requester(approval)})</span>
            </label>
            <Textarea
              id={commentId}
              rows={compact ? 2 : 3}
              placeholder="Comment for the requester (required for “Discuss”)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size={compact ? "sm" : "default"}
              className={cn(!compact && "h-[46px] px-[22px]")}
              disabled={isPending}
              onClick={() => decide("approve")}
            >
              Approve
            </Button>
            {approval.status !== "DISCUSS" && (
              <Button
                variant="outline"
                size={compact ? "sm" : "default"}
                className={cn(!compact && "h-[46px] px-5")}
                disabled={isPending || !comment.trim()}
                onClick={() => decide("discuss")}
              >
                Discussion needed
              </Button>
            )}
            <Button
              variant="ghost"
              size={compact ? "sm" : "default"}
              className={cn("ml-auto text-destructive hover:text-destructive", !compact && "h-[46px] px-4")}
              disabled={isPending}
              onClick={() => decide("reject")}
            >
              Reject
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

function ApprovalListCard({
  approval,
  selected,
  onSelect,
}: {
  approval: ApprovalRow;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-[14px] bg-card px-[18px] py-4 text-left transition-colors",
        selected ? "border-2 border-primary px-[17px] py-[15px]" : "border border-border hover:border-input"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={KIND_LABEL}>{kindOf(approval)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDate(new Date(approval.createdAt))}</span>
      </span>
      <span className="text-[15px] leading-[1.35] font-semibold break-words">{titleOf(approval)}</span>
      <span className="text-[13px] break-words text-muted-foreground">
        {joinParts(contextParts(approval, { withLinks: false }))}
      </span>
    </button>
  );
}

type QueueTab = "waiting" | "discuss";

/** Underline tab (44px, 2px dark rule when active). */
function UnderlineTab({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "-mb-px h-11 shrink-0 border-b-2 text-sm transition-colors",
        active ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Waiting / In discussion tabs, a list of request cards and the selected request beside it. */
function SplitQueue({ approvals, canReview }: { approvals: ApprovalRow[]; canReview: boolean }) {
  const waiting = approvals.filter((a) => a.status !== "DISCUSS");
  const discussing = approvals.filter((a) => a.status === "DISCUSS");
  const [tab, setTab] = useState<QueueTab>(waiting.length === 0 && discussing.length > 0 ? "discuss" : "waiting");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = tab === "waiting" ? waiting : discussing;
  // Fall back to the first card once the selected one is decided and leaves the list.
  const selected = items.find((a) => a.id === selectedId) ?? items[0];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Approval status" className="flex gap-6 overflow-x-auto border-b border-border">
        <UnderlineTab active={tab === "waiting"} onClick={() => setTab("waiting")}>
          Waiting <span className="font-mono">{waiting.length}</span>
        </UnderlineTab>
        <UnderlineTab active={tab === "discuss"} onClick={() => setTab("discuss")}>
          In discussion <span className="font-mono">{discussing.length}</span>
        </UnderlineTab>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {tab === "waiting" ? "No pending approvals." : "Nothing in discussion."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="flex flex-col gap-2.5 lg:col-span-5">
            {items.map((a) => (
              <ApprovalListCard key={a.id} approval={a} selected={a.id === selected?.id} onSelect={() => setSelectedId(a.id)} />
            ))}
          </div>
          <div className="lg:col-span-7">
            {selected && <ApprovalDetail key={selected.id} approval={selected} canReview={canReview} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalQueue({
  approvals,
  canReview = true,
  layout = "stack",
}: {
  approvals: ApprovalRow[];
  canReview?: boolean;
  /** "split" = tabs + list/detail (approvals page); "stack" = one card per request (dashboard). */
  layout?: "stack" | "split";
}) {
  if (layout === "split") return <SplitQueue approvals={approvals} canReview={canReview} />;
  if (approvals.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending approvals.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {approvals.map((a) => (
        <ApprovalDetail key={a.id} approval={a} canReview={canReview} compact />
      ))}
    </div>
  );
}
