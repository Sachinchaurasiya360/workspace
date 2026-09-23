import { AddEventDialog } from "@/components/discovery/add-event-dialog";
import { EventDetailDialog } from "@/components/discovery/event-detail-dialog";
import { EventResponseButton } from "@/components/discovery/event-response-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

function isFreeEvent(price: string | null) {
  if (!price) return true;
  return /free/i.test(price);
}

export default async function DiscoveryPage() {
  const session = await auth();
  const user = session!.user;

  const [events, myOverviews, myApprovals] = await Promise.all([
    db.event.findMany({ orderBy: { date: "asc" } }),
    db.eventOverview.findMany({ where: { userId: user.id } }),
    db.approval.findMany({
      where: { requestedById: user.id, type: "EVENT_ATTENDANCE" },
      include: { event: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const eventComments = await db.comment.findMany({
    where: { entityType: "EVENT", eventId: { in: events.map((e) => e.id) } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const registeredEventIds = new Set(myOverviews.map((o) => o.eventId));
  const pendingEventIds = new Set(
    myApprovals.filter((a) => a.status === "REQUEST_RAISED").map((a) => a.eventId!)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Discovery</h1>
          <p className="text-sm text-muted-foreground">Browse and request approval for upcoming events.</p>
        </div>
        <AddEventDialog />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          {events.length === 0 && (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">No events in the catalog yet.</p>
              </CardContent>
            </Card>
          )}
          {events.map((event) => {
            const status = registeredEventIds.has(event.id)
              ? "registered"
              : pendingEventIds.has(event.id)
                ? "pending"
                : "none";
            const free = isFreeEvent(event.price);
            return (
              <Card key={event.id}>
                <CardContent className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <EventDetailDialog
                        event={event}
                        comments={eventComments.filter((c) => c.eventId === event.id)}
                        isFree={free}
                        status={status}
                      />
                      {event.city && <Badge variant="outline">{event.city}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.date ? new Date(event.date).toLocaleDateString() : "Date TBC"}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{event.price ?? "Free"}</p>
                  </div>
                  <EventResponseButton eventId={event.id} isFree={free} status={status} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Approval tracker</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {myApprovals.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
            {myApprovals.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                <span className="truncate text-sm">{a.event?.name}</span>
                <Badge
                  variant={
                    a.status === "APPROVED" ? "success" : a.status === "REJECTED" ? "destructive" : "outline"
                  }
                >
                  {a.status.replace("_", " ")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
