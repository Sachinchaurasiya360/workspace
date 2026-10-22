"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addComment } from "@/actions/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommentEntityType } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } | null };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function CommentSection({
  entityType,
  entityId,
  comments,
  standalone,
}: {
  entityType: CommentEntityType;
  entityId: string;
  comments: CommentEntry[];
  /** Rendered inside its own titled card: drop the divider and the "Comments" heading. */
  standalone?: boolean;
}) {
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (isPending || !newComment.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addComment({ entityType, entityId, body: newComment.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Comment posted");
      setNewComment("");
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", !standalone && "border-t border-[#EFEDE6] pt-4")}>
      {!standalone && (
        <span className="text-[13px] font-semibold text-muted-foreground">
          Comments{comments.length > 0 && <span className="ml-1.5 font-mono text-xs">{comments.length}</span>}
        </span>
      )}
      <div className={cn("flex flex-col gap-3.5 overflow-y-auto", standalone ? "max-h-80" : "max-h-48")}>
        {comments.length > 0 ? (
          comments.map((c) => {
            const name = c.user?.name ?? "Deleted user";
            return (
              <div key={c.id} className="flex gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-secondary-foreground"
                >
                  {initials(name)}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </div>
                  <p className="text-sm leading-normal whitespace-pre-wrap text-secondary-foreground">{c.body}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Input
          placeholder="Add a comment…"
          aria-label="Add a comment"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" variant="secondary" className="h-11" onClick={handleAdd} disabled={isPending || !newComment.trim()}>
          Post
        </Button>
      </div>
    </div>
  );
}
