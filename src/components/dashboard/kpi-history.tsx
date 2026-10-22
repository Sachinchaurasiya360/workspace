import { ColumnChart } from "@/components/charts/charts";
import { SectionCard } from "@/components/dashboard/dashboard-ui";
import type { KpiMonth } from "@/lib/kpi";
import { cn } from "@/lib/utils";

/**
 * Performance over time: the weighted score per month as columns, plus the
 * month-by-month KPI table (actual / target) underneath as the exact values.
 */
export function KpiHistoryCard({ history, title = "Performance history" }: { history: KpiMonth[]; title?: string }) {
  const kpis = history[history.length - 1]?.rows ?? [];
  if (kpis.length === 0) return null;
  const hasScores = history.some((m) => m.score !== null);

  return (
    <SectionCard
      title={title}
      action={<span className="text-[13px] text-muted-foreground">Last {history.length} months</span>}
      bodyClassName="gap-4"
    >
        <ColumnChart
          valueName="Weighted score"
          unit="%"
          max={100}
          height={180}
          emptyMessage="No KPI targets in these months yet."
          data={history.map((m) => ({ label: m.label, value: m.score }))}
        />
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="px-2 py-2 text-left text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">KPI</th>
                {history.map((m) => (
                  <th key={m.month} className="px-2 py-2 text-right text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpis.map((k) => (
                <tr key={k.kpi} className="border-b border-muted last:border-0">
                  <td className="px-2 py-2.5 font-medium whitespace-nowrap">{k.label}</td>
                  {history.map((m) => {
                    const row = m.rows.find((r) => r.kpi === k.kpi);
                    const met = row?.target ? row.actual >= row.target : false;
                    return (
                      <td
                        key={m.month}
                        className={cn("px-2 py-2.5 text-right font-mono text-[13px] whitespace-nowrap tabular-nums", met && "font-medium text-success")}
                      >
                        {row?.actual ?? 0}
                        {row?.target ? <span className="text-xs font-normal text-muted-foreground">/{row.target}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!hasScores && <p className="text-xs text-muted-foreground">Scores appear once KPI targets are set.</p>}
    </SectionCard>
  );
}
