"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

// Categorical slots, in fixed order. Callers map an entity to a slot once
// (e.g. task status → slot) so colour never shifts when data changes.
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const AXIS_TICK = { fill: "var(--chart-muted)", fontSize: 11 };

function ChartTooltip({ active, payload, label, unit }: Partial<TooltipContentProps<number, string>> & { unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-[10px] border border-border bg-popover px-3 py-2.5 text-xs shadow-[0_8px_24px_rgba(23,24,28,0.10)]">
      {label !== undefined && <p className="mb-1.5 font-semibold text-foreground">{label}</p>}
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span>{p.name}</span>
          <span className="ml-auto font-mono font-medium text-foreground tabular-nums">
            {p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; value?: number | string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-medium text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-[2px]" style={{ background: item.color }} />
          <span>{item.label}</span>
          {item.value !== undefined && <span className="font-mono font-medium text-foreground tabular-nums">{item.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function Empty({ height, message = "No data yet." }: { height: number; message?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      {message}
    </div>
  );
}

/**
 * Part-to-whole at a glance (≤ 6 segments). The legend doubles as the
 * labelled table: every segment's name and count is always visible, so
 * low-contrast slots never carry meaning by colour alone.
 */
export function DonutChart({
  data,
  centerLabel,
  height = 180,
}: {
  data: { label: string; value: number; color: string }[];
  centerLabel?: string;
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty height={height} />;
  const visible = data.filter((d) => d.value > 0);

  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-4 @[22rem]:flex-row">
      <div className="relative shrink-0" style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={visible}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={visible.length > 1 ? 2 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {visible.map((d) => (
                <Cell key={d.label} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[26px] leading-none font-medium tracking-[-0.03em] tabular-nums">{total}</span>
          {centerLabel && <span className="mt-1 text-xs text-muted-foreground">{centerLabel}</span>}
        </div>
      </div>
      <ul className="flex w-full flex-1 flex-col gap-2 text-[13px]">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="whitespace-nowrap text-secondary-foreground">{d.label}</span>
            <span className="ml-auto font-mono font-medium tabular-nums">{d.value}</span>
            <span className="w-10 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {Math.round((d.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

/**
 * One series, horizontal bars — ranking people / projects / KPIs by a single
 * measure. Values are direct-labelled at the bar end; an optional reference
 * line marks the target (e.g. 100%).
 */
export function HorizontalBarChart({
  data,
  unit = "",
  max,
  reference,
  referenceLabel,
  valueName = "Value",
  color = SERIES[0],
}: {
  data: { label: string; value: number }[];
  unit?: string;
  max?: number;
  reference?: number;
  referenceLabel?: string;
  valueName?: string;
  color?: string;
}) {
  const height = Math.max(120, data.length * 34 + 30 + (referenceLabel ? 14 : 0));
  if (data.length === 0) return <Empty height={120} />;
  const domainMax = Math.max(max ?? 0, reference ?? 0, ...data.map((d) => d.value), 1);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: referenceLabel ? 18 : 4, right: 44, bottom: 4, left: 0 }}
          barCategoryGap={8}
        >
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            domain={[0, domainMax]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-axis)" }}
            unit={unit}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ ...AXIS_TICK, fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip unit={unit} />} />
          {reference !== undefined && (
            <ReferenceLine
              x={reference}
              stroke="var(--chart-muted)"
              label={referenceLabel ? { value: referenceLabel, position: "top", fill: "var(--chart-muted)", fontSize: 10 } : undefined}
            />
          )}
          <Bar
            dataKey="value"
            name={valueName}
            fill={color}
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            isAnimationActive={false}
            label={{ position: "right", fill: "var(--foreground)", fontSize: 11, formatter: (v: unknown) => `${v}${unit}` }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Change over time for a few related counts (calls / follow-ups / meetings…)
 * as stacked columns on one axis. Legend always shown (≥ 2 series).
 */
export function StackedColumnChart({
  data,
  series,
  height = 220,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  const hasData = data.some((row) => series.some((s) => Number(row[s.key]) > 0));
  if (!hasData) return <Empty height={height} message="No activity logged in this range." />;

  return (
    <div className="flex flex-col gap-3">
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip />} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                stroke="var(--card)"
                strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** One series of vertical columns for an ordered category (e.g. lead stages, months). */
export function ColumnChart({
  data,
  valueName = "Count",
  height = 200,
  color = SERIES[0],
  unit = "",
  max,
  emptyMessage,
}: {
  data: { label: string; value: number | null }[];
  valueName?: string;
  height?: number;
  color?: string;
  unit?: string;
  max?: number;
  emptyMessage?: string;
}) {
  if (data.every((d) => !d.value)) return <Empty height={height} message={emptyMessage} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -20 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: "var(--chart-axis)" }} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            unit={unit}
            domain={max !== undefined ? [0, max] : undefined}
          />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltip unit={unit} />} />
          <Bar
            dataKey="value"
            name={valueName}
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
            isAnimationActive={false}
            label={{
              position: "top",
              fill: "var(--foreground)",
              fontSize: 11,
              formatter: (v: unknown) => (v === null || v === undefined ? "" : `${v}${unit}`),
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
