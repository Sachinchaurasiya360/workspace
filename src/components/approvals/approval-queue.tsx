"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";

import { reviewApproval } from "@/actions/approvals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ApprovalRow = {
  id: string;
  type: "TASK_COMPLETION" | "EVENT_ATTENDANCE";
  requestedBy: { name: string };
  task: { title: string } | null;
  event: { name: string } | null;
  createdAt: Date;
};

export function ApprovalQueue({ approvals }: { approvals: ApprovalRow[] }) {
  const [isPending, startTransition] = useTransition();

  if (approvals.length === 0) {
    return <p className="text-sm text-muted-foreground">No pending approvals.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {approvals.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{a.task?.title ?? a.event?.name}</span>
            <span className="text-xs text-muted-foreground">
              {a.requestedBy.name} · {new Date(a.createdAt).toLocaleDateString()}
            </span>
          </div>
          <Badge variant="outline">{a.type === "TASK_COMPLETION" ? "Task" : "Event"}</Badge>
          <div className="flex gap-1.5">
            <Button
              size="icon"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await reviewApproval(a.id, "approve");
                })
              }
            >
              <Check className="text-success" />
            </Button>
            <Button
              size="icon"
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await reviewApproval(a.id, "reject");
                })
              }
            >
              <X className="text-destructive" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
