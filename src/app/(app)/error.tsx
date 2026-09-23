"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="size-8 text-destructive" />
          <p className="text-sm font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          <Button onClick={reset}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
