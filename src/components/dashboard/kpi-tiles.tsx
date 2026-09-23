import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { KpiRow } from "@/lib/kpi";

export function KpiTiles({ kpis }: { kpis: KpiRow[] }) {
  const visible = kpis.filter((k) => k.target !== null || k.actual > 0);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {visible.map((k) => {
        const percent = k.target ? Math.min(100, Math.round((k.actual / k.target) * 100)) : null;
        return (
          <Card key={k.kpi}>
            <CardContent className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-xl font-semibold">
                {k.actual}
                {k.target !== null && <span className="text-sm font-normal text-muted-foreground"> / {k.target}</span>}
              </p>
              {percent !== null && <Progress value={percent} />}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
