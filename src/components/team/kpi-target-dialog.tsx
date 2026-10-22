"use client";

import { useState, useTransition } from "react";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";

import { setKpiTarget } from "@/actions/daily-logs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ACCESS_LABEL } from "@/lib/access-labels";
import { KPI_LABEL, currentPeriod, kpisForAccess } from "@/lib/kpi-constants";
import { cn } from "@/lib/utils";
import type { AccessLevel, KpiMetric } from "@prisma/client";

type ExistingTarget = { kpi: KpiMetric; target: number; weight: number | null };
type Row = { kpi: KpiMetric; target: number; weight: number };

const numberInput =
  "h-[38px] rounded-[9px] border border-input bg-card px-2.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function KpiTargetDialog({
  userId,
  memberName,
  access,
  existingTargets,
}: {
  userId: string;
  memberName: string;
  access: AccessLevel;
  existingTargets: ExistingTarget[];
}) {
  // Only offer the KPIs this person is actually measured on.
  const options = kpisForAccess(access);
  const baseline = (): Row[] =>
    options.map((kpi) => {
      const existing = existingTargets.find((t) => t.kpi === kpi);
      return { kpi, target: existing?.target ?? 0, weight: existing?.weight ?? 1 };
    });
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(baseline);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const period = currentPeriod();

  function update(kpi: KpiMetric, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.kpi === kpi ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    const start = baseline();
    // Save each metric whose target or weight changed (same per-metric action as before).
    const changed = rows.filter((r) => {
      const was = start.find((s) => s.kpi === r.kpi);
      return !was || was.target !== r.target || was.weight !== r.weight;
    });
    if (changed.length === 0) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      for (const r of changed) {
        const result = await setKpiTarget({ userId, kpi: r.kpi, period, target: r.target, weight: r.weight });
        if (!result.ok) {
          setError(`${KPI_LABEL[r.kpi]}: ${result.error}`);
          return;
        }
      }
      toast.success(
        changed.length === 1
          ? `${KPI_LABEL[changed[0].kpi]} target saved for ${memberName}`
          : `${changed.length} KPI targets saved for ${memberName}`
      );
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Targets/access may have changed since mount; start from the latest values.
        if (next) setRows(baseline());
        setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={`Set KPI targets for ${memberName}`}>
          <Target className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-[640px]">
        <DialogHeader className="gap-1 px-6 pt-[22px] pr-20">
          <DialogTitle className="font-sans text-xl font-semibold tracking-normal">
            KPI targets — {memberName}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            {ACCESS_LABEL[access]} · {periodLabel(period)}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-[18px]">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_80px] gap-3 border-b border-border pb-2 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_140px_120px]">
            <span>Metric</span>
            <span>Monthly target</span>
            <span>Weight</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.kpi}
              className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_110px_80px] items-center gap-3 border-b border-[#EFEDE6] py-1.5 sm:grid-cols-[minmax(0,1fr)_140px_120px]"
            >
              <span className="text-sm font-medium">{KPI_LABEL[r.kpi]}</span>
              <input
                aria-label={`${KPI_LABEL[r.kpi]} target`}
                type="number"
                min={0}
                value={r.target}
                disabled={isPending}
                onChange={(e) => update(r.kpi, { target: Number(e.target.value) })}
                className={cn(numberInput, "w-full")}
              />
              <input
                aria-label={`${KPI_LABEL[r.kpi]} weight`}
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={r.weight}
                disabled={isPending}
                onChange={(e) => update(r.kpi, { weight: Number(e.target.value) })}
                className={cn(numberInput, "w-[70px]")}
              />
            </div>
          ))}
          <p className="py-3 text-xs text-muted-foreground">
            Weight sets how much each KPI counts toward the overall performance score (default 1).
          </p>
          {error && <p className="pb-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2.5 border-t border-[#EFEDE6] px-6 py-4 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-11 px-4">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" className="h-11 px-5" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Save targets
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
