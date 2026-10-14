"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { DeckSkeleton, ErrorState, GateNotice } from "@/components/common/gate-notice";
import { CoinLogo } from "@/components/deck/coin-logo";
import { Segmented } from "@/components/deck/segmented";
import { useCandles, useCoinRecentEvents, useSpikeAlerts, useTradeFlow, useWhales } from "@/hooks/use-cda-data";
import { useNow } from "@/hooks/use-now";
import { CHART_INTERVALS, INTERVAL_SECONDS, type Candle, type CdaEvent, type ChartInterval } from "@/lib/cda/types";
import { symbolMatches } from "@/lib/events";
import { fmtClock, fmtDateTime, fmtPct, fmtPrice, fmtUsd, relTime } from "@/lib/format";
import { DECK, leanTone } from "@/lib/palette";
import { useSettings, type ChartStyle } from "@/stores/settings";
import { useStream } from "@/stores/stream";
import { MARKER_SOURCES, collectMarkerItems, cvdByBar, groupMarkers, tradeFlowItems, type MarkerItem, type MarkerSource } from "./markers";
import { CVD_PANE_HEIGHT } from "./chart-layout";
import { FundingOiCard, NewsCard, QuantCard, WhaleSummaryCard, findWhaleCoin } from "./side-cards";

const PriceChart = dynamic(() => import("./price-chart"), {
  ssr: false,
  loading: () => <DeckSkeleton className="size-full" />,
});

const EMPTY_BARS: Candle[] = [];
const EMPTY_EVENTS: CdaEvent[] = [];
const MARKER_EVENT_TYPES = new Set(["whale_position", "liquidation", "whale_transfer"]);
const MIN_USD_OPTIONS = [10_000, 100_000, 1_000_000];
/** Main price pane height; the time axis adds ~24px below the panes. */
const MAIN_PANE = 420;
const TIME_AXIS = 24;

/** Layer chip look per marker source (design: colour + square or round swatch). */
const LAYER_STYLE: Record<MarkerSource, { color: string; radius: string }> = {
  positions: { color: DECK.long, radius: "2px" },
  trades: { color: DECK.longHover, radius: "50%" },
  liquidations: { color: DECK.amber, radius: "50%" },
  flows: { color: DECK.short, radius: "2px" },
};

/** Activity glyph tile per source. */
const ACTIVITY_GLYPH: Record<MarkerSource, string> = { trades: "●", positions: "◆", liquidations: "✦", flows: "■" };

function activityColor(it: MarkerItem): string {
  if (it.source === "liquidations") return DECK.amber;
  return it.dir === "buy" || it.dir === "outflow" ? DECK.long : DECK.short;
}

function activityTint(color: string): string {
  return color === DECK.amber ? "rgba(255,197,61,.12)" : color === DECK.long ? "rgba(0,245,212,.12)" : "rgba(255,45,117,.12)";
}

function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function CvdNote({ supported, flow }: { supported: boolean; flow: ReturnType<typeof useTradeFlow> }) {
  const text = !supported
    ? "CVD pane: switch to 1h or lower (trade flow covers the last 24h)."
    : flow.gate === "upgrade"
      ? "CVD pane requires Pro (trade flow)."
      : flow.gate === "no-key" || flow.gate === "invalid-key"
        ? "CVD pane needs a Pro key."
        : flow.error?.isWarming
          ? `Trade flow is warming up${flow.error.retryAfter ? `, retrying in ~${Math.ceil(flow.error.retryAfter)}s` : ""}.`
          : flow.error
            ? `CVD unavailable: ${flow.error.message}`
            : null;
  return text ? <div className="font-mono text-[11px] text-ink-dim">{text}</div> : null;
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
  const whales = useWhales();
  const now = useNow(15_000);
  const liveEvents = useStream(
    useShallow((s) => s.events.filter((e) => MARKER_EVENT_TYPES.has(e.type) && symbolMatches(e.symbol, symbol))),
  );

  const [enabled, setEnabled] = useState<Record<MarkerSource, boolean>>({ positions: true, trades: true, liquidations: true, flows: true });
  const [minUsd, setMinUsd] = useState(10_000);
  const [hoverBar, setHoverBar] = useState<Candle | null>(null);
  const onHoverBar = useCallback((b: Candle | null) => setHoverBar(b), []);

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

  // OHLC readout: hovered bar, else the last bar; change vs the previous bar.
  const shown = hoverBar ?? last ?? null;
  const shownIdx = shown ? bars.findIndex((b) => b.time === shown.time) : -1;
  const prev = shownIdx > 0 ? bars[shownIdx - 1] : null;
  const barChg = shown && prev && prev.close ? ((shown.close - prev.close) / prev.close) * 100 : null;

  const activity = useMemo(
    () =>
      items
        .filter((it) => enabled[it.source] && it.usd >= Math.max(minUsd, 1))
        .slice(-15)
        .reverse(),
    [items, enabled, minUsd],
  );

  const whaleCoin = findWhaleCoin(whales.data?.coins, symbol);
  const leanP = whaleCoin ? (whaleCoin.pctile30d ?? whaleCoin.longPct) : null;
  const tone = leanTone(leanP === null ? null : leanP >= 50);
  const sourceLabel = candles.data?.source === "binance" ? `Binance spot ${candles.data.symbol}` : null;
  const chartHeight = MAIN_PANE + TIME_AXIS + (cvd ? CVD_PANE_HEIGHT + 1 : 0);

  return (
    <>
      <div className="flex flex-wrap items-end gap-5">
        <div className="flex min-w-0 flex-col gap-3">
          <Link
            href={`/?sel=${encodeURIComponent(symbol)}`}
            className="self-start font-mono text-[11px] tracking-[.14em] text-ink-muted transition-colors hover:text-long"
          >
            ← BACK TO RADAR
          </Link>
          <div className="flex items-center gap-4">
            <span
              className="grid size-[58px] shrink-0 place-items-center rounded-full bg-logo"
              style={{ border: `2px solid ${tone.color}`, boxShadow: `0 0 26px ${tone.glow}` }}
            >
              <CoinLogo symbol={symbol} size={42} />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
                <h1 className="m-0 font-display text-[32px] leading-none font-bold sm:text-[40px]">{symbol}</h1>
                {last && <span className="font-mono text-[22px] text-ink-bright sm:text-[28px]">{fmtPrice(last.close)}</span>}
                {change24 !== null && (
                  <span
                    className="rounded-[20px] border px-[9px] py-[3px] font-mono text-[13px]"
                    style={{ color: change24 >= 0 ? DECK.long : DECK.short, borderColor: change24 >= 0 ? DECK.long : DECK.short }}
                  >
                    {fmtPct(change24, { digits: 2, sign: true })} 24h
                  </span>
                )}
              </div>
              {sourceLabel && <span className="font-mono text-[11px] text-ink-dim">{sourceLabel}</span>}
            </div>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2.5">
          <Segmented<ChartStyle>
            variant="mode"
            ariaLabel="Chart style"
            value={chartStyle}
            onChange={setChartStyle}
            options={[
              { value: "candles", label: "Candles" },
              { value: "line", label: "Line" },
            ]}
          />
          <Segmented<ChartInterval> variant="tf" ariaLabel="Chart interval" value={interval} onChange={setPicked} options={CHART_INTERVALS.map((i) => ({ value: i, label: i }))} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-[22px]">
        <div className="flex min-w-0 flex-[3_1_640px] flex-col gap-[22px]">
          <div className="flex min-w-0 flex-col gap-3.5 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              {MARKER_SOURCES.map((s) => {
                const on = enabled[s.id];
                const st = LAYER_STYLE[s.id];
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    title={s.hint}
                    onClick={() => setEnabled((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                    className="flex cursor-pointer items-center gap-2 rounded-[9px] border px-3 py-[7px] font-sans text-[12.5px] font-semibold transition-colors"
                    style={
                      on
                        ? { color: DECK.text, background: "rgba(120,140,255,.1)", borderColor: "rgba(120,140,255,.3)" }
                        : { color: DECK.dim, background: "transparent", borderColor: "rgba(120,140,255,.12)" }
                    }
                  >
                    <span className="size-[9px]" style={{ borderRadius: st.radius, background: st.color, boxShadow: `0 0 8px ${st.color}`, opacity: on ? 1 : 0.25 }} />
                    {s.label}
                    <span className="font-mono text-[11px] text-ink-muted">{counts[s.id]}</span>
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[12px] text-ink-muted">Min size</span>
                <Segmented<number> variant="mini" ariaLabel="Minimum marker size" value={minUsd} onChange={setMinUsd} options={MIN_USD_OPTIONS.map((v) => ({ value: v, label: fmtUsd(v) }))} />
              </div>
            </div>

            <div className="flex min-h-[18px] flex-wrap gap-x-4 gap-y-1 font-mono text-[12px] text-ink-muted">
              {shown && (
                <>
                  <span className="text-ink">{fmtDateTime(shown.time * 1000)}</span>
                  <span>
                    O <span className="text-ink">{fmtPrice(shown.open)}</span>
                  </span>
                  <span>
                    H <span className="text-ink">{fmtPrice(shown.high)}</span>
                  </span>
                  <span>
                    L <span className="text-ink">{fmtPrice(shown.low)}</span>
                  </span>
                  <span>
                    C <span className="text-ink">{fmtPrice(shown.close)}</span>
                  </span>
                  {barChg !== null && <span style={{ color: barChg >= 0 ? DECK.long : DECK.short }}>{fmtPct(barChg, { digits: 2, sign: true })}</span>}
                  <span>
                    Vol <span className="text-ink">{fmtUsd(shown.volume * shown.close)}</span>
                  </span>
                </>
              )}
            </div>

            <div className="relative w-full" style={{ height: chartHeight }}>
              {candles.gate !== "ok" ? (
                <div className="flex size-full items-center justify-center p-6">
                  <GateNotice gate={candles.gate} requiredTier={candles.requiredTier} feature="Price candles" className="max-w-md" />
                </div>
              ) : candles.isLoading ? (
                <DeckSkeleton className="size-full" />
              ) : !bars.length ? (
                <div className="flex size-full items-center justify-center p-6">
                  {candles.error ? (
                    <ErrorState error={candles.error} onRetry={candles.refetch} className="max-w-md" />
                  ) : (
                    <p className="m-0 text-[13px] text-ink-muted">No candles found for {symbol} on Hyperliquid or Binance.</p>
                  )}
                </div>
              ) : (
                <PriceChart
                  bars={bars}
                  groups={groups}
                  cvd={cvd}
                  style={chartStyle}
                  onHoverBar={onHoverBar}
                  resetKey={`${symbol}:${interval}:${candles.data?.source}`}
                />
              )}
            </div>

            <div className="text-[11.5px] leading-relaxed text-pretty text-ink-dim">
              ▲▼ whale position changes · circles: big taker buys / sells · amber rings: liquidations · squares: exchange outflows (cyan) / inflows (pink). Lower pane:
              cumulative taker volume delta.
            </div>
            <CvdNote supported={cvdSupported} flow={flow} />
          </div>

          <div className="flex flex-col gap-1.5 rounded-[18px] border border-iris/13 bg-panel p-4 sm:p-[22px]">
            <div className="font-display text-[18px] font-semibold">Recent whale activity in {symbol}</div>
            <div className="mb-2 text-[13px] text-ink-muted">The events behind the chart markers, newest first.</div>
            {activity.length === 0 ? (
              <p className="m-0 border-t border-iris/7 pt-3 text-[13px] text-ink-muted">
                {recent.gate !== "ok" && recent.gate !== "loading"
                  ? "Add an API key to load recent whale events for this coin."
                  : "No whale events above the size filter yet. They appear here and on the chart as they stream in."}
              </p>
            ) : (
              activity.map((it) => {
                const color = activityColor(it);
                const tint = activityTint(color);
                const sub = [it.source === "flows" ? sentence(it.label) : null, it.detail || null].filter(Boolean).join(" · ");
                return (
                  <div key={it.key} className="grid grid-cols-[64px_34px_minmax(0,1fr)_auto] items-center gap-3 border-t border-iris/7 px-1 py-3 sm:grid-cols-[76px_34px_minmax(0,1fr)_auto]">
                    <div className="flex flex-col gap-0.5 font-mono">
                      <span className="text-[13px] text-ink">{fmtClock(it.ts)}</span>
                      <span className="text-[10.5px] text-ink-dim">{relTime(it.ts, now)}</span>
                    </div>
                    <div
                      className="grid size-[30px] place-items-center rounded-[9px] border text-[13px]"
                      style={{ background: tint, borderColor: color, color, boxShadow: `0 0 12px ${tint}` }}
                      aria-hidden
                    >
                      {ACTIVITY_GLYPH[it.source]}
                    </div>
                    <div className="flex min-w-0 flex-col gap-[3px]">
                      <span className="truncate text-[14px] font-semibold">{it.title}</span>
                      <span className="truncate text-[12px] text-ink-muted">{sub || " "}</span>
                    </div>
                    <span className="font-mono text-[14px] font-semibold text-ink-bright">{fmtUsd(it.usd)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <WhaleSummaryCard symbol={symbol} />
          <FundingOiCard symbol={symbol} />
          <QuantCard symbol={symbol} />
          <NewsCard symbol={symbol} />
        </div>
      </div>
    </>
  );
}
