import type { EventExecution, EventParticipation } from "@prisma/client";

// Client-safe vocabulary for a person's two independent event tracks.
export const PARTICIPATION_LABEL: Record<EventParticipation, string> = {
  REGISTERED: "Registered",
  ATTENDED: "Attended",
};

export const EXECUTION_LABEL: Record<EventExecution, string> = {
  IN_PLAN: "In plan",
  CONDUCTED: "Conducted",
};

/** Where the viewer stands with an event, on both tracks plus any open approval request. */
export type EventStanding = {
  participation: EventParticipation | null;
  execution: EventExecution | null;
  approval: "none" | "pending" | "discuss";
};

export const NO_STANDING: EventStanding = { participation: null, execution: null, approval: "none" };

/** Short labels for badges, e.g. ["Attended", "Conducted"]. */
export function standingLabels(o: { participation: EventParticipation | null; execution: EventExecution | null }) {
  return [o.participation && PARTICIPATION_LABEL[o.participation], o.execution && EXECUTION_LABEL[o.execution]].filter(
    (l): l is string => !!l
  );
}
