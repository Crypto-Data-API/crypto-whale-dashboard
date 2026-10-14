"use client";

import { useEffect, useRef, useState } from "react";
import {
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/cda/types";
import { fmtCompact, fmtDateTime, fmtPrice, fmtUsd, priceDigits } from "@/lib/format";
import { PALETTE, withAlpha } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { toSeriesMarkers, type MarkerGroup } from "./markers";

export interface PriceChartProps {
  bars: Candle[];
  groups: MarkerGroup[];
  cvd: { time: UTCTimestamp; value: number }[] | null;
  /** Changes when symbol/interval change, so the view is re-framed once. */
  resetKey: string;
  className?: string;
}

/** Default viewport: the most recent N days, whatever the interval. */
const VISIBLE_DAYS = 4;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function tickMarkFormatter(time: Time, type: TickMarkType): string | null {
  if (typeof time !== "number") return null;
  const d = new Date(time * 1000);
  switch (type) {
    case TickMarkType.Year:
      return String(d.getFullYear());
    case TickMarkType.Month:
      return d.toLocaleString("en-GB", { month: "short" });
    case TickMarkType.DayOfMonth:
      return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" })}`;
    case TickMarkType.Time:
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case TickMarkType.TimeWithSeconds:
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    default:
      return null;
  }
}

function timeFormatter(time: Time): string {
  return typeof time === "number" ? fmtDateTime(time * 1000) : String(time);
}

function findBar(bars: Candle[], t: number): Candle | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = bars[mid].time;
    if (v === t) return bars[mid];
    if (v < t) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

type Hover = { bar: Candle | null; group: MarkerGroup | null; x: number; y: number; w: number };

/** Candles + volume + whale markers (+ optional CVD pane). Imperative lightweight-charts v5 wrapper. */
export default function PriceChart({ bars, groups, cvd, resetKey, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const cvdRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const groupsRef = useRef<Map<string, MarkerGroup>>(new Map());
  const barsRef = useRef<Candle[]>([]);
  const framedKey = useRef<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: PALETTE.textMuted,
        fontSize: 11,
        panes: { separatorColor: PALETTE.grid, separatorHoverColor: withAlpha(PALETTE.transfer, 0.25), enableResize: true },
      },
      grid: { vertLines: { color: PALETTE.grid }, horzLines: { color: PALETTE.grid } },
      rightPriceScale: { borderColor: PALETTE.axis },
      timeScale: { borderColor: PALETTE.axis, timeVisible: true, secondsVisible: false, rightOffset: 6, tickMarkFormatter },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { timeFormatter },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: PALETTE.long,
      downColor: PALETTE.short,
      borderUpColor: PALETTE.long,
      borderDownColor: PALETTE.short,
      wickUpColor: PALETTE.long,
      wickDownColor: PALETTE.short,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const markers = createSeriesMarkers(candles, []);

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || typeof param.time !== "number") {
        setHover(null);
        return;
      }
      const id = param.hoveredInfo?.objectId;
      const group = typeof id === "string" ? (groupsRef.current.get(id) ?? null) : null;
      setHover({ bar: findBar(barsRef.current, param.time), group, x: param.point.x, y: param.point.y, w: el.clientWidth });
    };
    chart.subscribeCrosshairMove(onMove);

    chartRef.current = chart;
    candleRef.current = candles;
    volumeRef.current = volume;
    markersRef.current = markers;
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      markers.detach();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volumeRef.current = null;
      cvdRef.current = null;
      markersRef.current = null;
      framedKey.current = null;
    };
  }, []);

  // Candles + volume.
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleRef.current;
    const volume = volumeRef.current;
    if (!chart || !candles || !volume) return;
    barsRef.current = bars;
    candles.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    volume.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: withAlpha(b.close >= b.open ? PALETTE.long : PALETTE.short, 0.35),
      })),
    );
    const last = bars[bars.length - 1];
    if (last) {
      const precision = priceDigits(Math.abs(last.close));
      candles.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    }
    if (bars.length && framedKey.current !== resetKey) {
      framedKey.current = resetKey;
      const cutoff = (bars[bars.length - 1].time as number) - VISIBLE_DAYS * 86_400;
      let first = bars.findIndex((b) => (b.time as number) >= cutoff);
      if (first < 0) first = 0;
      // Never frame fewer than 20 bars (e.g. on the 1d interval).
      first = Math.min(first, Math.max(0, bars.length - 20));
      chart.timeScale().setVisibleLogicalRange({ from: first, to: bars.length + 4 });
    }
  }, [bars, resetKey]);

  // Markers.
  useEffect(() => {
    groupsRef.current = new Map(groups.map((g) => [g.id, g]));
    markersRef.current?.setMarkers(toSeriesMarkers(groups));
  }, [groups]);

  // CVD pane (pane index 1), created lazily.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (cvd && cvd.length) {
      if (!cvdRef.current) {
        cvdRef.current = chart.addSeries(
          BaselineSeries,
          {
            baseValue: { type: "price", price: 0 },
            topLineColor: PALETTE.long,
            topFillColor1: withAlpha(PALETTE.long, 0.18),
            topFillColor2: withAlpha(PALETTE.long, 0.02),
            bottomLineColor: PALETTE.short,
            bottomFillColor1: withAlpha(PALETTE.short, 0.02),
            bottomFillColor2: withAlpha(PALETTE.short, 0.18),
            lineWidth: 2,
            priceLineVisible: false,
            priceFormat: { type: "custom", formatter: (v: number) => fmtUsd(v), minMove: 1 },
          },
          1,
        );
        chart.panes()[1]?.setHeight(110);
      }
      cvdRef.current.setData(cvd);
    } else if (cvdRef.current) {
      chart.removeSeries(cvdRef.current);
      cvdRef.current = null;
    }
  }, [cvd]);

  const shown = hover?.bar ?? bars[bars.length - 1] ?? null;
  const prev = shown ? bars[bars.findIndex((b) => b.time === shown.time) - 1] : undefined;
  const change = shown && prev ? ((shown.close - prev.close) / prev.close) * 100 : null;

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {shown && (
        <div className="pointer-events-none absolute top-1 left-2 z-10 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          <span className="tabular">
            O <span className="text-foreground">{fmtPrice(shown.open)}</span>
          </span>
          <span className="tabular">
            H <span className="text-foreground">{fmtPrice(shown.high)}</span>
          </span>
          <span className="tabular">
            L <span className="text-foreground">{fmtPrice(shown.low)}</span>
          </span>
          <span className="tabular">
            C <span className="text-foreground">{fmtPrice(shown.close)}</span>
          </span>
          {change !== null && (
            <span className="tabular">
              <span className={cn("mr-0.5 inline-block size-1.5 rounded-full align-middle", change >= 0 ? "bg-long" : "bg-short")} />
              <span className="text-foreground">
                {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </span>
          )}
          <span className="tabular">
            Vol <span className="text-foreground">{fmtCompact(shown.volume)}</span>
          </span>
        </div>
      )}
      {hover?.group && (
        <div
          className="pointer-events-none absolute z-20 w-60 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{
            left: hover.x,
            top: hover.y,
            transform: `translate(${hover.x > hover.w / 2 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
          }}
        >
          <MarkerTooltip group={hover.group} />
        </div>
      )}
    </div>
  );
}

function MarkerTooltip({ group }: { group: MarkerGroup }) {
  const title =
    group.source === "positions"
      ? group.dir === "buy"
        ? "Whale buy-side flow"
        : "Whale sell-side flow"
      : group.source === "trades"
        ? group.dir === "buy"
          ? "Big taker buying"
          : "Big taker selling"
        : group.source === "liquidations"
        ? `${group.dir === "long" ? "Long" : "Short"} liquidations`
        : group.dir === "inflow"
          ? "Exchange inflow"
          : "Exchange outflow";
  const dot = group.source === "liquidations" ? "bg-liq" : group.dir === "buy" || group.dir === "outflow" ? "bg-long" : "bg-short";
  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          <span className={cn("size-2 rounded-full", dot)} />
          {title}
        </span>
        <span className="tabular font-semibold">{fmtUsd(group.usd)}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {group.items.slice(-6).map((it) => (
          <li key={it.key} className="flex justify-between gap-2">
            <span className="min-w-0 truncate text-muted-foreground">
              <span className="text-foreground">{it.label.charAt(0).toUpperCase() + it.label.slice(1)}</span>
              {it.detail ? ` · ${it.detail}` : ""}
            </span>
            <span className="tabular shrink-0">{fmtUsd(it.usd)}</span>
          </li>
        ))}
      </ul>
      {group.items.length > 6 && <p className="mt-0.5 text-muted-foreground">+{group.items.length - 6} more</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">{fmtDateTime(group.time * 1000)}</p>
    </>
  );
}
