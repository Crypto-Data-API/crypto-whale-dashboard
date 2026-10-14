"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/cda/types";
import { fmtDateTime, fmtUsd, priceDigits } from "@/lib/format";
import { DECK, PALETTE, withAlpha } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { CVD_PANE_HEIGHT } from "./chart-layout";
import { toSeriesMarkers, type MarkerGroup } from "./markers";

export interface PriceChartProps {
  bars: Candle[];
  groups: MarkerGroup[];
  cvd: { time: UTCTimestamp; value: number }[] | null;
  /** Candlesticks or a close-price area line. */
  style?: "candles" | "line";
  /** Changes when symbol/interval change, so the view is re-framed once. */
  resetKey: string;
  /** Bar under the crosshair (null when the pointer leaves the chart). */
  onHoverBar?: (bar: Candle | null) => void;
  className?: string;
}

/** Default viewport: the most recent N days, whatever the interval. */
const VISIBLE_DAYS = 1;

const HAIRLINE = "rgba(120,140,255,.1)";

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

/** The next/font family name behind --font-jetbrains (canvas cannot read CSS variables). */
function monoFamily(): string {
  if (typeof window === "undefined") return "monospace";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim();
  return v ? `${v}, monospace` : "monospace";
}

type Hover = { group: MarkerGroup; x: number; y: number; w: number };

/** Candles / area line + volume + whale markers (+ optional CVD pane). Imperative lightweight-charts v5 wrapper. */
export default function PriceChart({ bars, groups, cvd, style = "candles", resetKey, onHoverBar, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const cvdRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const priceLineRef = useRef<{ series: ISeriesApi<SeriesType>; line: IPriceLine } | null>(null);
  const groupsRef = useRef<Map<string, MarkerGroup>>(new Map());
  const barsRef = useRef<Candle[]>([]);
  const styleRef = useRef(style);
  const hoverCbRef = useRef(onHoverBar);
  const framedKey = useRef<string | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [cvdTop, setCvdTop] = useState<number | null>(null);

  useEffect(() => {
    hoverCbRef.current = onHoverBar;
  }, [onHoverBar]);

  /** Dashed last-price line with a blue axis label, on whichever series is visible. */
  const syncPriceLine = () => {
    const target = styleRef.current === "line" ? lineRef.current : candleRef.current;
    const last = barsRef.current[barsRef.current.length - 1];
    const current = priceLineRef.current;
    if (!target || !last) return;
    if (current && current.series === target) {
      current.line.applyOptions({ price: last.close });
      return;
    }
    if (current) current.series.removePriceLine(current.line);
    const line = target.createPriceLine({
      price: last.close,
      color: "rgba(232,236,255,.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      axisLabelColor: DECK.blue,
      axisLabelTextColor: "#ffffff",
      title: "",
    });
    priceLineRef.current = { series: target as ISeriesApi<SeriesType>, line };
  };

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: DECK.dim,
        fontSize: 10.5,
        fontFamily: monoFamily(),
        panes: { separatorColor: HAIRLINE, separatorHoverColor: withAlpha(DECK.long, 0.25), enableResize: true },
      },
      grid: { vertLines: { color: PALETTE.gridVert }, horzLines: { color: PALETTE.grid } },
      rightPriceScale: { borderColor: HAIRLINE, minimumWidth: 74 },
      timeScale: { borderColor: HAIRLINE, timeVisible: true, secondsVisible: false, rightOffset: 6, tickMarkFormatter },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(0,245,212,.5)", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#0f6f66" },
        horzLine: { color: "rgba(0,245,212,.3)", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0f6f66" },
      },
      localization: { timeFormatter },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: DECK.long,
      downColor: DECK.short,
      borderUpColor: DECK.long,
      borderDownColor: DECK.short,
      wickUpColor: DECK.long,
      wickDownColor: DECK.short,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.2 } });
    // Close-price area on the same scale; shown instead of candles in "line" style.
    const line = chart.addSeries(AreaSeries, {
      lineColor: DECK.blueSoft,
      lineWidth: 2,
      topColor: "rgba(77,124,255,.28)",
      bottomColor: "rgba(77,124,255,0)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerBackgroundColor: DECK.blueSoft,
      crosshairMarkerBorderColor: "#ffffff",
      visible: false,
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    const markers = createSeriesMarkers(candles, []);

    const onMove = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined || typeof param.time !== "number") {
        setHover(null);
        hoverCbRef.current?.(null);
        return;
      }
      hoverCbRef.current?.(findBar(barsRef.current, param.time));
      const id = param.hoveredInfo?.objectId;
      const group = typeof id === "string" ? (groupsRef.current.get(id) ?? null) : null;
      setHover(group ? { group, x: param.point.x, y: param.point.y, w: el.clientWidth } : null);
    };
    chart.subscribeCrosshairMove(onMove);
    // Keep the CVD label on its pane after the separator is dragged.
    const remeasure = () => {
      if (!cvdRef.current) return;
      const pane = chart.panes()[1]?.getHTMLElement();
      setCvdTop(pane ? pane.getBoundingClientRect().top - el.getBoundingClientRect().top : null);
    };
    el.addEventListener("pointerup", remeasure);

    chartRef.current = chart;
    candleRef.current = candles;
    lineRef.current = line;
    volumeRef.current = volume;
    markersRef.current = markers;
    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      el.removeEventListener("pointerup", remeasure);
      markersRef.current?.detach();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      lineRef.current = null;
      volumeRef.current = null;
      cvdRef.current = null;
      markersRef.current = null;
      priceLineRef.current = null;
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
    lineRef.current?.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.close })));
    volume.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(0,245,212,.22)" : "rgba(255,45,117,.22)",
      })),
    );
    const last = bars[bars.length - 1];
    if (last) {
      const precision = priceDigits(Math.abs(last.close));
      const priceFormat = { type: "price" as const, precision, minMove: 1 / 10 ** precision };
      candles.applyOptions({ priceFormat });
      lineRef.current?.applyOptions({ priceFormat });
    }
    syncPriceLine();
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

  // Chart style: toggle series visibility and move markers + price line to the visible one.
  useEffect(() => {
    const candles = candleRef.current;
    const line = lineRef.current;
    if (!candles || !line) return;
    styleRef.current = style;
    const isLine = style === "line";
    candles.applyOptions({ visible: !isLine });
    line.applyOptions({ visible: isLine });
    markersRef.current?.detach();
    markersRef.current = createSeriesMarkers(isLine ? line : candles, toSeriesMarkers(groups));
    syncPriceLine();
    // `groups` is intentionally read, not depended on: the markers effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  // Markers.
  useEffect(() => {
    groupsRef.current = new Map(groups.map((g) => [g.id, g]));
    markersRef.current?.setMarkers(toSeriesMarkers(groups));
  }, [groups]);

  // CVD pane (pane index 1), created lazily.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let frame = 0;
    if (cvd && cvd.length) {
      if (!cvdRef.current) {
        const series = chart.addSeries(
          BaselineSeries,
          {
            baseValue: { type: "price", price: 0 },
            topLineColor: DECK.long,
            topFillColor1: withAlpha(DECK.long, 0.2),
            topFillColor2: withAlpha(DECK.long, 0.02),
            bottomLineColor: DECK.short,
            bottomFillColor1: withAlpha(DECK.short, 0.02),
            bottomFillColor2: withAlpha(DECK.short, 0.2),
            lineWidth: 2,
            priceLineVisible: false,
            priceFormat: { type: "custom", formatter: (v: number) => fmtUsd(v), minMove: 1 },
          },
          1,
        );
        series.createPriceLine({ price: 0, color: "rgba(138,144,180,.25)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
        cvdRef.current = series;
        chart.panes()[1]?.setHeight(CVD_PANE_HEIGHT);
      }
      cvdRef.current.setData(cvd);
      // Measure after the chart has laid out the new pane (two frames).
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const pane = chart.panes()[1]?.getHTMLElement();
          const box = containerRef.current?.getBoundingClientRect();
          setCvdTop(pane && box ? pane.getBoundingClientRect().top - box.top : null);
        });
      });
    } else if (cvdRef.current) {
      chart.removeSeries(cvdRef.current);
      cvdRef.current = null;
      frame = requestAnimationFrame(() => setCvdTop(null));
    }
    return () => cancelAnimationFrame(frame);
  }, [cvd]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={containerRef} className="absolute inset-0" />
      {cvdTop !== null && (
        <div className="pointer-events-none absolute left-2 z-10 font-mono text-[10px] tracking-[.12em] text-ink-dim" style={{ top: cvdTop + 6 }}>
          CVD · TAKER DELTA
        </div>
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-[12px] border border-iris/16 bg-[#0b0d1a]/95 px-3 py-2.5 text-[12px] shadow-[0_18px_40px_rgba(0,0,0,.55)] backdrop-blur-md"
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
  const color = group.source === "liquidations" ? DECK.amber : group.dir === "buy" || group.dir === "outflow" ? DECK.long : DECK.short;
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          {title}
        </span>
        <span className="font-mono font-semibold" style={{ color }}>
          {fmtUsd(group.usd)}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {group.items.slice(-6).map((it) => (
          <li key={it.key} className="flex justify-between gap-2">
            <span className="min-w-0 truncate text-ink-muted">
              <span className="text-ink">{it.label.charAt(0).toUpperCase() + it.label.slice(1)}</span>
              {it.detail ? ` · ${it.detail}` : ""}
            </span>
            <span className="shrink-0 font-mono">{fmtUsd(it.usd)}</span>
          </li>
        ))}
      </ul>
      {group.items.length > 6 && <p className="m-0 mt-0.5 text-ink-muted">+{group.items.length - 6} more</p>}
      <p className="m-0 mt-1 font-mono text-[10.5px] text-ink-dim">{fmtDateTime(group.time * 1000)}</p>
    </>
  );
}
