"use client";

import { useState, useTransition } from "react";

import { addComment } from "@/actions/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommentEntityType } from "@prisma/client";

type CommentEntry = { id: string; body: string; createdAt: Date | string; user: { name: string } };

export function CommentSection({
  entityType,
  entityId,
  comments,
}: {
  entityType: CommentEntityType;
  entityId: string;
  comments: CommentEntry[];
}) {
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!newComment.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addComment({ entityType, entityId, body: newComment.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNewComment("");
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <span className="text-sm font-medium">Comments</span>
      <div className="flex max-h-40 flex-col gap-3 overflow-y-auto">
        {comments.length > 0 ? (
          comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium">{c.user.name}</span>{" "}
              <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
              <p className="text-muted-foreground">{c.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Input placeholder="Add a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={isPending}>
          Post
        </Button>
      </div>
    </div>
  );
}
