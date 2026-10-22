"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-[#f8e3e0] text-destructive">
          <AlertTriangle className="size-6" />
        </span>
        <h2 className="font-display text-[28px]">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <Button onClick={reset} className="mt-2">
          Try again
        </Button>
      </div>
    </div>
  );
}
