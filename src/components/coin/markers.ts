import type { SeriesMarker, UTCTimestamp } from "lightweight-charts";
import type { Candle, CdaEvent, ExchangeFlowSpike, TradeFlowBucket } from "@/lib/cda/types";
import { positionFlow, symbolMatches } from "@/lib/events";
import { fmtUsd, shortAddress } from "@/lib/format";
import { PALETTE } from "@/lib/palette";

export type MarkerSource = "positions" | "liquidations" | "flows";

export const MARKER_SOURCES: { id: MarkerSource; label: string; hint: string }[] = [
  { id: "positions", label: "Whale buys / sells", hint: "Hyperliquid whale position changes (stream)" },
  { id: "liquidations", label: "Liquidations", hint: "Liquidations across venues (stream)" },
  { id: "flows", label: "Exchange flows", hint: "Large CEX wallet inflows / outflows (on-chain)" },
];

/** One normalised item that can become (part of) a chart marker. */
export interface MarkerItem {
  key: string;
  source: MarkerSource;
  /** "buy" | "sell" for positions, "long" | "short" for liquidations, "inflow" | "outflow" for flows */
  dir: string;
  ts: number;
  usd: number;
  label: string;
  detail: string;
}

/** Aggregated marker shown on one bar. */
export interface MarkerGroup {
  id: string;
  source: MarkerSource;
  dir: string;
  time: number;
  usd: number;
  items: MarkerItem[];
}

export function collectMarkerItems(symbol: string, events: CdaEvent[], spikes: ExchangeFlowSpike[]): MarkerItem[] {
  const out: MarkerItem[] = [];
  const seenIds = new Set<number>();
  const flowKeys = new Set<string>();

  for (const e of events) {
    if (seenIds.has(e.id) || !symbolMatches(e.symbol, symbol)) continue;
    seenIds.add(e.id);
    const usd = Math.abs(e.usd ?? 0);
    if (e.type === "whale_position") {
      const flow = positionFlow(e);
      if (!flow) continue;
      const action = (e.action ?? "").toLowerCase();
      out.push({
        key: `p${e.id}`,
        source: "positions",
        dir: flow,
        ts: e.ts,
        usd,
        label: `${action || "change"} ${e.side ?? ""}`.trim(),
        detail: [e.address ? shortAddress(e.address) : null, typeof e.change_pct === "number" ? `${e.change_pct > 0 ? "+" : ""}${e.change_pct.toFixed(1)}%` : null]
          .filter(Boolean)
          .join(" · "),
      });
    } else if (e.type === "liquidation") {
      const side = (e.side ?? "").toLowerCase();
      out.push({
        key: `l${e.id}`,
        source: "liquidations",
        dir: side === "short" ? "short" : "long",
        ts: e.ts,
        usd,
        label: `${side || "?"} liquidated`,
        detail: [e.venue ?? null, typeof e.px === "number" ? `@ ${e.px}` : null].filter(Boolean).join(" · "),
      });
    } else if (e.type === "whale_transfer") {
      const dir = (e.direction ?? "").toLowerCase();
      if (dir !== "inflow" && dir !== "outflow") continue;
      const fk = `${Math.round(e.ts / 60_000)}-${dir}-${Math.round(usd / 50_000)}`;
      flowKeys.add(fk);
      out.push({
        key: `t${e.id}`,
        source: "flows",
        dir,
        ts: e.ts,
        usd,
        label: `${dir} ${dir === "inflow" ? "to" : "from"} ${e.exchange ?? "exchange"}`,
        detail: e.chain ? `on ${e.chain}` : "",
      });
    }
  }

  for (const s of spikes) {
    if (!symbolMatches(s.symbol, symbol)) continue;
    const dir = s.direction;
    if (dir !== "inflow" && dir !== "outflow") continue;
    const usd = Math.abs(s.amountUsd ?? 0);
    const fk = `${Math.round(s.ts / 60_000)}-${dir}-${Math.round(usd / 50_000)}`;
    if (flowKeys.has(fk)) continue;
    flowKeys.add(fk);
    out.push({
      key: `s${s.ts}-${s.exchange}-${usd}`,
      source: "flows",
      dir,
      ts: s.ts,
      usd,
      label: `${dir} ${dir === "inflow" ? "to" : "from"} ${s.exchange ?? "exchange"}`,
      detail: s.chain ? `on ${s.chain}` : "",
    });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Largest bar time <= tsSec (binary search). Null if outside the bar range. */
export function snapToBar(bars: Candle[], tsSec: number, intervalSec: number): number | null {
  if (!bars.length) return null;
  if (tsSec < bars[0].time) return null;
  const last = bars[bars.length - 1];
  if (tsSec >= last.time + intervalSec * 2) return null;
  let lo = 0;
  let hi = bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].time <= tsSec) lo = mid;
    else hi = mid - 1;
  }
  return bars[lo].time;
}

export function groupMarkers(
  items: MarkerItem[],
  bars: Candle[],
  intervalSec: number,
  enabled: Record<MarkerSource, boolean>,
  minUsd: number,
): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>();
  for (const it of items) {
    if (!enabled[it.source]) continue;
    if (it.usd < minUsd) continue;
    const time = snapToBar(bars, Math.floor(it.ts / 1000), intervalSec);
    if (time === null) continue;
    const id = `${it.source}:${it.dir}:${time}`;
    let g = groups.get(id);
    if (!g) {
      g = { id, source: it.source, dir: it.dir, time, usd: 0, items: [] };
      groups.set(id, g);
    }
    g.usd += it.usd;
    g.items.push(it);
  }
  return [...groups.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function sizeFor(usd: number): number {
  // 1 at <= $50K, ~2.4 at >= $50M (log scale)
  if (usd <= 50_000) return 1;
  return Math.min(2.4, 1 + Math.log10(usd / 50_000) * 0.47);
}

export function toSeriesMarkers(groups: MarkerGroup[]): SeriesMarker<UTCTimestamp>[] {
  return groups.map((g) => {
    const time = g.time as UTCTimestamp;
    const count = g.items.length > 1 ? ` ×${g.items.length}` : "";
    const size = sizeFor(g.usd);
    if (g.source === "positions") {
      const buy = g.dir === "buy";
      return {
        id: g.id,
        time,
        position: buy ? "belowBar" : "aboveBar",
        shape: buy ? "arrowUp" : "arrowDown",
        color: buy ? PALETTE.long : PALETTE.short,
        text: `${fmtUsd(g.usd)}${count}`,
        size,
      };
    }
    if (g.source === "liquidations") {
      const longLiq = g.dir === "long";
      return {
        id: g.id,
        time,
        position: longLiq ? "belowBar" : "aboveBar",
        shape: "circle",
        color: PALETTE.liq,
        text: g.usd >= 100_000 ? fmtUsd(g.usd) : undefined,
        size: Math.max(0.6, size * 0.8),
      };
    }
    const inflow = g.dir === "inflow";
    return {
      id: g.id,
      time,
      position: inflow ? "aboveBar" : "belowBar",
      shape: "square",
      color: inflow ? PALETTE.short : PALETTE.long,
      text: fmtUsd(g.usd),
      size: Math.max(0.8, size * 0.9),
    };
  });
}

/** Cumulative volume delta per bar from 1-minute taker flow buckets. */
export function cvdByBar(flow: TradeFlowBucket[], intervalSec: number): { time: UTCTimestamp; value: number }[] {
  const perBar = new Map<number, number>();
  for (const b of flow) {
    const t = Math.floor(b.time / 1000 / intervalSec) * intervalSec;
    perBar.set(t, (perBar.get(t) ?? 0) + (b.buyNotional - b.sellNotional));
  }
  let cum = 0;
  return [...perBar.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, delta]) => {
      cum += delta;
      return { time: t as UTCTimestamp, value: cum };
    });
}
