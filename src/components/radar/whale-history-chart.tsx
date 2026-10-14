"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DeckSkeleton, ErrorState, GateNotice } from "@/components/common/gate-notice";
import { Panel, PanelSub, PanelTitle } from "@/components/deck/panel";
import { useWhalesHistory } from "@/hooks/use-cda-data";
import type { WhaleHistoryPoint } from "@/lib/cda/types";
import { fmtUsd } from "@/lib/format";
import { DECK, PALETTE, withAlpha } from "@/lib/palette";

function shortDate(d: string): string {
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return d;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function HistoryTooltip({ active, payload }: { active?: boolean; payload?: { payload: WhaleHistoryPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-[10px] border border-iris/16 bg-[#0b0d1a]/95 px-3 py-2 font-mono text-[11.5px] shadow-xl">
      <div className="mb-1 text-ink">
        {shortDate(p.date)}
        {p.estimated && <span className="ml-1 text-ink-dim">(modelled)</span>}
      </div>
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        <span className="text-long">Long</span>
        <span className="text-right">{fmtUsd(p.longUsd)}</span>
        <span className="text-short">Short</span>
        <span className="text-right">{fmtUsd(p.shortUsd)}</span>
        <span className="text-ink-muted">Net</span>
        <span className="text-right" style={{ color: (p.netUsd ?? 0) >= 0 ? DECK.long : DECK.short }}>
          {fmtUsd(p.netUsd, { sign: true })}
        </span>
      </div>
    </div>
  );
}

/** Daily whale long vs short notional (risk-on / risk-off cycle). Pro Plus. */
export function WhaleHistoryChart() {
  const q = useWhalesHistory(180);
  const points = q.data ?? [];
  return (
    <Panel className="gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <PanelTitle>Whale long vs short notional, 180 days</PanelTitle>
          <PanelSub>Daily gross long and short books of tracked Hyperliquid whales. Earlier points may be modelled.</PanelSub>
        </div>
        {q.gate === "ok" && points.length > 0 && (
          <div className="ml-auto flex items-center gap-[22px] text-[11.5px] text-ink-soft">
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-3.5 rounded bg-long shadow-[0_0_8px_#00f5d4]" /> Long notional
            </span>
            <span className="flex items-center gap-2">
              <span className="h-0.5 w-3.5 rounded bg-short shadow-[0_0_8px_#ff2d75]" /> Short notional
            </span>
          </div>
        )}
      </div>
      {q.gate !== "ok" ? (
        <GateNotice gate={q.gate} requiredTier={q.requiredTier ?? "pro_plus"} feature="Whale positioning history" />
      ) : q.isLoading ? (
        <DeckSkeleton className="h-60 w-full" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={q.refetch} />
      ) : points.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-muted">No history returned.</p>
      ) : (
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="hist-long" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.long} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={PALETTE.long} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="hist-short" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE.short} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={PALETTE.short} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={PALETTE.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                stroke={PALETTE.axis}
                tick={{ fill: DECK.dim, fontSize: 10.5, fontFamily: "var(--font-jetbrains)" }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => fmtUsd(v, { digits: 0 })}
                stroke={PALETTE.axis}
                tick={{ fill: DECK.dim, fontSize: 10.5, fontFamily: "var(--font-jetbrains)" }}
                tickLine={false}
                axisLine={false}
                width={56}
              />
              <Tooltip content={<HistoryTooltip />} cursor={{ stroke: withAlpha(DECK.long, 0.4) }} />
              <Area
                type="monotone"
                dataKey="longUsd"
                name="Long"
                stroke={PALETTE.long}
                strokeWidth={2}
                fill="url(#hist-long)"
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
                fill="url(#hist-short)"
                dot={false}
                activeDot={{ r: 4, stroke: PALETTE.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
