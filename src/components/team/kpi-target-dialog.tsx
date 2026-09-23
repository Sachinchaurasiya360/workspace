"use client";

import { useState, useTransition } from "react";
import { Loader2, Target } from "lucide-react";

import { setKpiTarget } from "@/actions/daily-logs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KPI_LABEL, currentPeriod } from "@/lib/kpi-constants";
import { KpiMetric } from "@prisma/client";

export function KpiTargetDialog({
  userId,
  memberName,
  existingTargets,
}: {
  userId: string;
  memberName: string;
  existingTargets: { kpi: KpiMetric; target: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [kpi, setKpi] = useState<KpiMetric>(KpiMetric.CALLS);
  const [target, setTarget] = useState(existingTargets.find((t) => t.kpi === KpiMetric.CALLS)?.target ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleKpiChange(value: KpiMetric) {
    setKpi(value);
    setTarget(existingTargets.find((t) => t.kpi === value)?.target ?? 0);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await setKpiTarget({ userId, kpi, period: currentPeriod(), target });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title={`Set KPI targets for ${memberName}`}>
          <Target className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>KPI targets — {memberName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">Period: {currentPeriod()}</p>
          <div className="flex flex-col gap-2">
            <Label>Metric</Label>
            <Select value={kpi} onValueChange={(v) => handleKpiChange(v as KpiMetric)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KPI_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="kpi-target">Target</Label>
            <Input
              id="kpi-target"
              type="number"
              min={0}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="animate-spin" />}
            Save target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
