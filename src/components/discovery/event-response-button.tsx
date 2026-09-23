"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { respondToEvent } from "@/actions/events";
import { Button } from "@/components/ui/button";

export function EventResponseButton({
  eventId,
  isFree,
  status,
}: {
  eventId: string;
  isFree: boolean;
  status: "none" | "pending" | "registered";
}) {
  const [isPending, startTransition] = useTransition();

  if (status === "registered") {
    return (
      <Button size="sm" variant="secondary" disabled>
        Registered
      </Button>
    );
  }
  if (status === "pending") {
    return (
      <Button size="sm" variant="outline" disabled>
        Approval pending
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await respondToEvent(eventId);
        })
      }
    >
      {isPending && <Loader2 className="animate-spin" />}
      {isFree ? "Register" : "Request approval"}
    </Button>
  );
}
