import { fmtCompact, fmtPct, fmtPrice, fmtUsd, shortAddress } from "@/lib/format";
import type { CdaEvent, EventType } from "@/lib/cda/types";
import { isEventType } from "@/lib/cda/types";
import type { FeedPrefs, Thresholds } from "@/stores/settings";

/** Semantic tone used for colouring: long/buy/outflow vs short/sell/inflow. */
export type Tone = "long" | "short" | "liq" | "neutral";

/** USD size of an event when it has one (absolute value). */
export function eventUsd(e: CdaEvent): number | null {
  return typeof e.usd === "number" ? Math.abs(e.usd) : null;
}

/**
 * Net flow direction of a whale position change.
 * entry/increase long  -> buy,  entry/increase short -> sell,
 * exit/decrease long   -> sell, exit/decrease short  -> buy.
 */
export function positionFlow(e: CdaEvent): "buy" | "sell" | null {
  const action = (e.action ?? "").toLowerCase();
  const side = (e.side ?? "").toLowerCase();
  const opening = action === "entry" || action === "increase" || action === "open";
  const closing = action === "exit" || action === "decrease" || action === "close";
  if (!opening && !closing) return null;
  if (side === "long") return opening ? "buy" : "sell";
  if (side === "short") return opening ? "sell" : "buy";
  return opening ? "buy" : "sell";
}

export function eventTone(e: CdaEvent): Tone {
  switch (e.type) {
    case "liquidation":
      return "liq";
    case "whale_transfer":
      return (e.direction ?? "").toLowerCase() === "outflow" ? "long" : (e.direction ?? "").toLowerCase() === "inflow" ? "short" : "neutral";
    case "whale_position": {
      const f = positionFlow(e);
      return f === "buy" ? "long" : f === "sell" ? "short" : "neutral";
    }
    case "price_move":
    case "oi_delta":
      return (e.pct ?? e.usd ?? 0) > 0 ? "long" : (e.pct ?? e.usd ?? 0) < 0 ? "short" : "neutral";
    case "funding":
      return (e.rate_1h ?? 0) > 0 ? "long" : (e.rate_1h ?? 0) < 0 ? "short" : "neutral";
    default:
      return "neutral";
  }
}

export function sideTone(side: string | undefined | null): Tone {
  const s = (side ?? "").toLowerCase();
  if (s === "long" || s === "buy" || s === "outflow") return "long";
  if (s === "short" || s === "sell" || s === "inflow") return "short";
  return "neutral";
}

function upper(s: string | undefined | null): string {
  return (s ?? "").toUpperCase();
}

/** Human description: [headline, detail]. */
export function describeEvent(e: CdaEvent): { headline: string; detail: string } {
  switch (e.type) {
    case "liquidation": {
      const side = (e.side ?? "").toLowerCase();
      const headline = side ? `${side === "long" ? "Long" : side === "short" ? "Short" : upper(side)} liquidated` : "Liquidation";
      const parts: string[] = [];
      if (typeof e.px === "number") parts.push(`@ ${fmtPrice(e.px)}`);
      if (typeof e.sz === "number") parts.push(`${fmtCompact(e.sz)} ${e.symbol}`);
      return { headline, detail: parts.join(" · ") };
    }
    case "whale_transfer": {
      const dir = (e.direction ?? "").toLowerCase();
      const headline = dir === "inflow" ? `Inflow to ${e.exchange ?? "exchange"}` : dir === "outflow" ? `Outflow from ${e.exchange ?? "exchange"}` : `Transfer ${e.exchange ?? ""}`.trim();
      const parts: string[] = [];
      if (typeof e.amount === "number") parts.push(`${fmtCompact(e.amount, 2)} ${e.symbol}`);
      if (e.chain) parts.push(`on ${e.chain}`);
      return { headline, detail: parts.join(" ") };
    }
    case "whale_position": {
      const action = (e.action ?? "").toLowerCase();
      const verb = action === "entry" ? "Opened" : action === "exit" ? "Closed" : action === "increase" ? "Added to" : action === "decrease" ? "Reduced" : upper(action);
      const side = (e.side ?? "").toLowerCase();
      const headline = `${verb} ${side || "position"}`.trim();
      const parts: string[] = [];
      if (typeof e.size === "number") parts.push(`${fmtCompact(e.size, 2)} ${e.symbol}`);
      if (typeof e.change_pct === "number") parts.push(fmtPct(e.change_pct, { sign: true }));
      if (e.address) parts.push(shortAddress(e.address));
      return { headline, detail: parts.join(" · ") };
    }
    case "funding": {
      const r = typeof e.rate_1h === "number" ? e.rate_1h * 100 : null;
      const prev = typeof e.prev_rate_1h === "number" ? e.prev_rate_1h * 100 : null;
      return {
        headline: e.settle ? "Funding settled" : "Funding update",
        detail: `${r !== null ? `${r.toFixed(4)}%/h` : "—"}${prev !== null ? ` (prev ${prev.toFixed(4)}%)` : ""}`,
      };
    }
    case "oi_delta": {
      const window = typeof e.window_s === "number" ? ` in ${Math.round(e.window_s)}s` : "";
      return {
        headline: `OI ${(e.usd ?? 0) >= 0 ? "up" : "down"} ${fmtPct(e.pct, { digits: 3, sign: true })}${window}`,
        detail: typeof e.oi_usd === "number" ? `OI ${fmtUsd(e.oi_usd)}` : "",
      };
    }
    case "price_move": {
      const window = typeof e.window_s === "number" ? ` in ${Math.round(e.window_s)}s` : "";
      return {
        headline: `Price ${(e.pct ?? 0) >= 0 ? "up" : "down"} ${fmtPct(e.pct, { digits: 2, sign: true })}${window}`,
        detail: typeof e.price === "number" ? `to ${fmtPrice(e.price)}` : "",
      };
    }
    default:
      return { headline: e.type, detail: "" };
  }
}

/** Parse "BTC, eth  sol" into an upper-case set (empty = all). */
export function parseSymbolFilter(s: string): Set<string> {
  return new Set(
    s
      .split(/[\s,;]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  );
}

/** Feed display filter: type checkboxes, symbol list, min USD (USD-sized events only). */
export function matchesFeed(e: CdaEvent, prefs: Pick<FeedPrefs, "types" | "minUsd">, symbols: Set<string>): boolean {
  if (isEventType(e.type) && !prefs.types[e.type]) return false;
  if (symbols.size && !symbols.has(e.symbol.toUpperCase())) return false;
  if (prefs.minUsd > 0) {
    const usd = eventUsd(e);
    if (usd !== null && usd < prefs.minUsd) return false;
  }
  return true;
}

/** Per-type alert threshold check (used for sound / browser notifications). */
export function exceedsThreshold(e: CdaEvent, t: Thresholds): boolean {
  if (!isEventType(e.type)) return false;
  const type: EventType = e.type;
  switch (type) {
    case "price_move":
      return Math.abs(e.pct ?? 0) >= t.price_move;
    case "funding":
      return Math.abs((e.rate_1h ?? 0) * 100) >= t.funding;
    default:
      return (eventUsd(e) ?? 0) >= t[type];
  }
}

export function symbolMatches(eventSymbol: string, symbol: string): boolean {
  return eventSymbol === symbol || eventSymbol.toUpperCase() === symbol.toUpperCase();
}
