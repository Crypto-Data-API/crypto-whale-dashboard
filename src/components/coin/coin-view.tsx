"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CandlestickChart, LineChart } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ErrorState, GateNotice } from "@/components/common/gate-notice";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCandles, useCoinRecentEvents, useSpikeAlerts, useTradeFlow } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import { CHART_INTERVALS, INTERVAL_SECONDS, type Candle, type CdaEvent, type ChartInterval } from "@/lib/cda/types";
import { symbolMatches } from "@/lib/events";
import { fmtClock, fmtPct, fmtPrice, fmtUsd, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useSettings, type ChartStyle } from "@/stores/settings";
import { useStream } from "@/stores/stream";
import { MARKER_SOURCES, collectMarkerItems, cvdByBar, groupMarkers, tradeFlowItems, type MarkerItem, type MarkerSource } from "./markers";
import { FundingOiCard, NewsCard, QuantCard, WhaleSummaryCard } from "./side-cards";

const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

const EMPTY_BARS: Candle[] = [];
const EMPTY_EVENTS: CdaEvent[] = [];
const MARKER_EVENT_TYPES = new Set(["whale_position", "liquidation", "whale_transfer"]);
const MIN_USD_OPTIONS = [0, 10_000, 100_000, 1_000_000];

function Swatch({ source }: { source: MarkerSource }) {
  if (source === "positions") {
    return (
      <span className="flex items-center gap-px" aria-hidden>
        <span className="size-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-long" />
        <span className="size-0 border-x-[4px] border-t-[7px] border-x-transparent border-t-short" />
      </span>
    );
  }
  if (source === "trades") {
    return (
      <span className="flex gap-px" aria-hidden>
        <span className="size-2 rounded-full bg-long" />
        <span className="size-2 rounded-full bg-short" />
      </span>
    );
  }
  if (source === "liquidations") return <span className="size-2 rounded-full bg-liq" aria-hidden />;
  return (
    <span className="flex gap-px" aria-hidden>
      <span className="size-2 bg-short" />
      <span className="size-2 bg-long" />
    </span>
  );
}

function IntervalSwitch({ value, onChange }: { value: ChartInterval; onChange: (v: ChartInterval) => void }) {
  return (
    <div className="flex rounded-md border border-input p-0.5 text-xs" role="radiogroup" aria-label="Chart interval">
      {CHART_INTERVALS.map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          onClick={() => onChange(i)}
          className={cn(
            "tabular rounded px-2.5 py-1",
            value === i ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i}
        </button>
      ))}
    </div>
  );
}

function StyleSwitch({ value, onChange }: { value: ChartStyle; onChange: (v: ChartStyle) => void }) {
  const opts = [
    { id: "candles", label: "Candles", Icon: CandlestickChart },
    { id: "line", label: "Line", Icon: LineChart },
  ] as const;
  return (
    <div className="flex rounded-md border border-input p-0.5 text-xs" role="radiogroup" aria-label="Chart style">
      {opts.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          title={label}
          onClick={() => onChange(id)}
          className={cn(
            "flex items-center gap-1 rounded px-2 py-1",
            value === id ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function activityLabel(it: MarkerItem): { title: string; tone: "long" | "short" | "liq" } {
  if (it.source === "positions") return { title: it.dir === "buy" ? "Whale buy" : "Whale sell", tone: it.dir === "buy" ? "long" : "short" };
  if (it.source === "trades") return { title: it.dir === "buy" ? "Big taker buy" : "Big taker sell", tone: it.dir === "buy" ? "long" : "short" };
  if (it.source === "liquidations") return { title: `${it.dir === "long" ? "Long" : "Short"} liquidation`, tone: "liq" };
  return { title: it.dir === "inflow" ? "Exchange inflow" : "Exchange outflow", tone: it.dir === "outflow" ? "long" : "short" };
}

export function CoinView({ symbol }: { symbol: string }) {
  const defaultInterval = useSettings((s) => s.defaultInterval);
  const chartStyle = useSettings((s) => s.chartStyle);
  const setChartStyle = useSettings((s) => s.setChartStyle);
  const [picked, setPicked] = useState<ChartInterval | null>(null);
  const interval = picked ?? defaultInterval;
  const intervalSec = INTERVAL_SECONDS[interval];
  const cvdSupported = intervalSec <= 3600;

  const candles = useCandles(symbol, interval);
  const flow = useTradeFlow(symbol, 1440, true);
  const recent = useCoinRecentEvents(symbol);
  const spikes = useSpikeAlerts(1_000_000);
  const now = useNow(15_000);
  const liveEvents = useStream(
    useShallow((s) => s.events.filter((e) => MARKER_EVENT_TYPES.has(e.type) && symbolMatches(e.symbol, symbol))),
  );

  const [enabled, setEnabled] = useState<Record<MarkerSource, boolean>>({ positions: true, trades: true, liquidations: true, flows: true });
  const [minUsd, setMinUsd] = useState(10_000);

  const bars = candles.data?.bars ?? EMPTY_BARS;
  const recentEvents = recent.data?.events ?? EMPTY_EVENTS;

  const items = useMemo(
    () =>
      collectMarkerItems(symbol, recentEvents.concat(liveEvents), spikes.data ?? [])
        .concat(tradeFlowItems(symbol, flow.data?.data ?? []))
        .sort((a, b) => a.ts - b.ts),
    [symbol, recentEvents, liveEvents, spikes.data, flow.data],
  );
  const groups = useMemo(() => groupMarkers(items, bars, intervalSec, enabled, minUsd), [items, bars, intervalSec, enabled, minUsd]);
  const counts = useMemo(() => {
    const c: Record<MarkerSource, number> = { positions: 0, trades: 0, liquidations: 0, flows: 0 };
    for (const it of items) if (it.usd >= minUsd) c[it.source]++;
    return c;
  }, [items, minUsd]);
  const cvd = useMemo(() => (cvdSupported && flow.data?.data.length ? cvdByBar(flow.data.data, intervalSec) : null), [cvdSupported, flow.data, intervalSec]);

  const last = bars[bars.length - 1];
  const dayAgo = useMemo(() => {
    if (!last) return null;
    const target = last.time - 86400;
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].time <= target) return bars[i];
    return null;
  }, [bars, last]);
  const change24 = last && dayAgo ? ((last.close - dayAgo.close) / dayAgo.close) * 100 : null;

  const activity = useMemo(
    () =>
      items
        .filter((it) => enabled[it.source] && it.usd >= Math.max(minUsd, 1))
        .slice(-15)
        .reverse(),
    [items, enabled, minUsd],
  );

  const sourceLabel = candles.data?.source === "binance" ? `Binance spot ${candles.data.symbol}` : candles.data ? "Hyperliquid perp" : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono">{symbol}</span>
            {last && <span className="tabular text-lg font-medium">{fmtPrice(last.close)}</span>}
            {change24 !== null && (
              <span className="tabular flex items-center gap-1 text-sm font-normal">
                <span className={cn("size-2 rounded-full", change24 >= 0 ? "bg-long" : "bg-short")} aria-hidden />
                {fmtPct(change24, { digits: 2, sign: true })} 24h
              </span>
            )}
          </span>
        }
        description={sourceLabel ? `${sourceLabel} · whale trades, liquidations and exchange flows on the chart` : "Price chart with whale activity"}
        actions={
          <>
            <StyleSwitch value={chartStyle} onChange={setChartStyle} />
            <IntervalSwitch value={interval} onChange={setPicked} />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card size="sm" className="gap-2">
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {MARKER_SOURCES.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-1.5" title={s.hint}>
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--transfer)]"
                      checked={enabled[s.id]}
                      onChange={(e) => setEnabled((prev) => ({ ...prev, [s.id]: e.target.checked }))}
                    />
                    <Swatch source={s.id} />
                    <span>{s.label}</span>
                    <span className="tabular text-muted-foreground">{counts[s.id]}</span>
                  </label>
                ))}
                <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
                  Min size
                  <select
                    value={minUsd}
                    onChange={(e) => setMinUsd(Number(e.target.value))}
                    className="h-6 rounded border border-input bg-muted/40 px-1 text-xs text-foreground"
                  >
                    {MIN_USD_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v === 0 ? "Any" : fmtUsd(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={cn("relative w-full", cvd ? "h-[460px] sm:h-[560px]" : "h-[380px] sm:h-[480px]")}>
                {candles.gate !== "ok" ? (
                  <div className="flex size-full items-center justify-center p-6">
                    <GateNotice gate={candles.gate} requiredTier={candles.requiredTier} feature="Price candles" className="max-w-md" />
                  </div>
                ) : candles.isLoading ? (
                  <Skeleton className="size-full" />
                ) : !bars.length ? (
                  <div className="flex size-full items-center justify-center p-6">
                    {candles.error ? (
                      <ErrorState error={candles.error} onRetry={candles.refetch} className="max-w-md" />
                    ) : (
                      <p className="text-sm text-muted-foreground">No candles found for {symbol} on Hyperliquid or Binance.</p>
                    )}
                  </div>
                ) : (
                  <PriceChart bars={bars} groups={groups} cvd={cvd} style={chartStyle} resetKey={`${symbol}:${interval}:${candles.data?.source}`} />
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  Arrows: whale position changes by net flow (buy = opening long or closing short). Green / coral dots: minutes of big taker buying / selling (last 24h). Amber circles: liquidations. Squares: exchange
                  inflows (coral) and outflows (green).
                </span>
                <span>
                  {!cvdSupported
                    ? "CVD pane: switch to 1h or lower (trade flow covers the last 24h)."
                    : flow.gate === "upgrade"
                      ? "CVD pane requires Pro (trade flow)."
                      : flow.gate === "no-key" || flow.gate === "invalid-key"
                        ? "CVD pane needs a Pro key."
                        : flow.error?.isWarming
                          ? `Trade flow is warming up${flow.error.retryAfter ? `, retrying in ~${Math.ceil(flow.error.retryAfter)}s` : ""}.`
                          : flow.error
                            ? `CVD unavailable: ${flow.error.message}`
                            : cvd
                              ? "Lower pane: cumulative taker volume delta (CVD), last 24h."
                              : null}
                </span>
                <span>Whale markers cover the stream buffer (about the last 2 hours) plus anything received while this tab is open.</span>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Recent whale activity in {symbol}</CardTitle>
              <CardDescription>The events behind the chart markers, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {recent.gate !== "ok" && recent.gate !== "loading"
                    ? "Add an API key to load recent whale events for this coin."
                    : "No whale events above the size filter yet. They appear here and on the chart as they stream in."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {activity.map((it) => {
                    const { title, tone } = activityLabel(it);
                    return (
                      <li key={it.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5 text-sm">
                        <span className="flex flex-col leading-tight">
                          <span className="tabular text-xs">{fmtClock(it.ts)}</span>
                          <span className="text-[10px] text-muted-foreground">{relTime(it.ts, now)}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn("size-2 shrink-0 rounded-full", tone === "long" ? "bg-long" : tone === "short" ? "bg-short" : "bg-liq")}
                              aria-hidden
                            />
                            <span className="truncate">{title}</span>
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {sentence(it.label)}
                            {it.detail ? ` · ${it.detail}` : ""}
                          </span>
                        </span>
                        <span className="tabular text-right font-medium">{fmtUsd(it.usd)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <WhaleSummaryCard symbol={symbol} />
          <FundingOiCard symbol={symbol} />
          <QuantCard symbol={symbol} />
          <NewsCard symbol={symbol} />
        </div>
      </div>
    </>
  );
}
