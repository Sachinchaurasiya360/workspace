import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/charts";
import { ScoreBar, SectionCard } from "@/components/dashboard/dashboard-ui";
import { weightedScore, type KpiRow } from "@/lib/kpi";
import { KPI_PERIODS, KPI_PERIOD_LABEL, type KpiPeriod } from "@/lib/kpi-constants";
import { cn } from "@/lib/utils";

const KPI_PERIOD_SHORT: Record<KpiPeriod, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

/** Period switcher as links so the choice lives in the URL. `query` carries other params (e.g. viewAs). */
export function KpiPeriodTabs({
  current,
  query = "",
  basePath = "/",
}: {
  current: KpiPeriod;
  query?: string;
  basePath?: string;
}) {
  return (
    <div role="group" aria-label="Period" className="flex max-w-full gap-0.5 overflow-x-auto rounded-[11px] bg-secondary p-1">
      {KPI_PERIODS.map((p) => (
        <Link
          key={p}
          href={`${basePath}?${query}${query ? "&" : ""}period=${p}`}
          scroll={false}
          aria-current={p === current ? "true" : undefined}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-[13px] whitespace-nowrap transition-colors sm:px-3.5",
            p === current
              ? "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgba(23,24,28,0.08)]"
              : "font-medium text-secondary-foreground hover:text-foreground"
          )}
        >
          {KPI_PERIOD_SHORT[p]}
        </Link>
      ))}
    </div>
  );
}

export function KpiTiles({ kpis }: { kpis: KpiRow[] }) {
  if (kpis.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {kpis.map((k) => {
        const percent = k.target ? Math.min(100, Math.round((k.actual / k.target) * 100)) : null;
        return (
          <div key={k.kpi} className="flex min-w-0 flex-col gap-2.5 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-[18px]">
            <span className="truncate text-[13px] font-medium text-muted-foreground">{k.label}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[22px] leading-none font-medium tracking-[-0.03em] tabular-nums sm:text-[26px]">
                {k.actual}
              </span>
              {k.target !== null && <span className="text-[13px] text-muted-foreground">/ {k.target}</span>}
            </div>
            {percent !== null ? (
              <ScoreBar value={percent} />
            ) : (
              <span className="text-[11px] text-muted-foreground">No target set</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Dark weighted-score hero tile. */
export function ScoreHero({ score, period }: { score: number | null; period: KpiPeriod }) {
  return (
    <div className="flex h-full flex-col justify-between gap-4 rounded-2xl bg-foreground p-6 text-background">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[#C9C8C1]">
          Weighted score · {KPI_PERIOD_LABEL[period].toLowerCase()}
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[52px] leading-none font-medium tracking-[-0.04em] tabular-nums sm:text-[64px]">
            {score === null ? "—" : score}
          </span>
          {score !== null && <span className="text-base text-[#B7B6AE]">/ 100</span>}
        </div>
      </div>
      <p className="text-[13px] leading-normal text-[#C9C8C1]">
        {score === null
          ? "No targets set yet."
          : period === "today" || period === "week"
            ? "Targets are monthly; today and this week show a pro-rated share."
            : "Each KPI counts toward the score by its weight, capped at its target."}
      </p>
    </div>
  );
}

/** Full KPI block: weighted-score hero, tiles and a % of target chart. */
export function KpiSection({
  kpis,
  period,
  title = "Performance",
}: {
  kpis: KpiRow[];
  period: KpiPeriod;
  /** Kept for callers; the period switcher now lives in the page header. */
  query?: string;
  title?: string;
}) {
  if (kpis.length === 0) return null;
  const score = weightedScore(kpis);
  const withTargets = kpis.filter((k) => k.target);

  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <ScoreHero score={score} period={period} />
        </div>
        <div className="lg:col-span-9">
          <KpiTiles kpis={kpis} />
        </div>
      </div>
      {withTargets.length > 1 && (
        <SectionCard
          title="Target achievement"
          action={<span className="text-[13px] text-muted-foreground">{KPI_PERIOD_LABEL[period]}</span>}
        >
          <HorizontalBarChart
            valueName="Of target"
            unit="%"
            reference={100}
            referenceLabel="Target"
            data={withTargets.map((k) => ({ label: k.label, value: Math.round((k.actual / k.target!) * 100) }))}
          />
        </SectionCard>
      )}
    </section>
  );
}
