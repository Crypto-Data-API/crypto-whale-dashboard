"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, GateNotice } from "@/components/common/gate-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useWhalesHistory } from "@/hooks/use-cda-data";
import type { WhaleHistoryPoint } from "@/lib/cda/types";
import { fmtUsd } from "@/lib/format";
import { PALETTE, withAlpha } from "@/lib/palette";

function shortDate(d: string): string {
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: WhaleHistoryPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-medium">
        {shortDate(p.date)}
        {p.estimated && <span className="ml-1 text-muted-foreground">(modelled)</span>}
      </div>
      <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full bg-long" /> Long
        </span>
        <span className="tabular text-right">{fmtUsd(p.longUsd)}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2 rounded-full bg-short" /> Short
        </span>
        <span className="tabular text-right">{fmtUsd(p.shortUsd)}</span>
        <span className="text-muted-foreground">Net</span>
        <span className="tabular text-right">{fmtUsd(p.netUsd, { sign: true })}</span>
      </div>
    </div>
  );
}

/** Daily whale long vs short notional (risk-on / risk-off cycle). Pro Plus. */
export function WhaleHistoryChart() {
  const q = useWhalesHistory(180);
  const points = q.data ?? [];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Whale long vs short notional, 180 days</CardTitle>
        <CardDescription>Daily gross long and short books of tracked Hyperliquid whales. Earlier points may be modelled.</CardDescription>
      </CardHeader>
      <CardContent>
        {q.gate !== "ok" ? (
          <GateNotice gate={q.gate} requiredTier={q.requiredTier ?? "pro_plus"} feature="Whale positioning history" />
        ) : q.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : points.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history returned.</p>
        ) : (
          <>
            <ul className="mb-2 flex gap-4 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-long" /> Long notional
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-short" /> Short notional
              </li>
            </ul>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={PALETTE.grid} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    stroke={PALETTE.axis}
                    tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtUsd(v, { digits: 0 })}
                    stroke={PALETTE.axis}
                    tick={{ fill: PALETTE.textMuted, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <Tooltip content={<HistoryTooltip />} cursor={{ stroke: PALETTE.axis }} />
                  <Area
                    type="monotone"
                    dataKey="longUsd"
                    name="Long"
                    stroke={PALETTE.long}
                    strokeWidth={2}
                    fill={withAlpha(PALETTE.long, 0.1)}
                    dot={false}
                    activeDot={{ r: 4, stroke: PALETTE.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="shortUsd"
                    name="Short"
                    stroke={PALETTE.short}
                    strokeWidth={2}
                    fill={withAlpha(PALETTE.short, 0.1)}
                    dot={false}
                    activeDot={{ r: 4, stroke: PALETTE.surface, strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
