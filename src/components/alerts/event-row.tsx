"use client";

import Link from "next/link";
import { memo } from "react";
import { CoinLogo } from "@/components/deck/coin-logo";
import { eventTone } from "@/lib/events";
import { EVENT_LABEL, isEventType, type CdaEvent, type EventType } from "@/lib/cda/types";
import { fmtClock, fmtCompact, fmtPct, fmtPrice, fmtUsd, relTime, shortAddress } from "@/lib/format";
import { DECK } from "@/lib/palette";

/** Per-type glyph and colour from the design. */
export const TYPE_STYLE: Record<EventType, { glyph: string; color: string }> = {
  whale_position: { glyph: "◆", color: DECK.violet },
  whale_transfer: { glyph: "⇄", color: DECK.blueSoft },
  liquidation: { glyph: "✦", color: DECK.amber },
  oi_delta: { glyph: "∿", color: DECK.long },
  price_move: { glyph: "↗", color: DECK.text },
  funding: { glyph: "%", color: DECK.short },
};

const TINTS: Record<string, { tint: string; border: string }> = {
  [DECK.long]: { tint: "rgba(0,245,212,.1)", border: "rgba(0,245,212,.35)" },
  [DECK.short]: { tint: "rgba(255,45,117,.1)", border: "rgba(255,45,117,.35)" },
  [DECK.amber]: { tint: "rgba(255,197,61,.1)", border: "rgba(255,197,61,.35)" },
  [DECK.blueSoft]: { tint: "rgba(125,155,255,.12)", border: "rgba(125,155,255,.35)" },
  [DECK.violet]: { tint: "rgba(177,140,255,.12)", border: "rgba(177,140,255,.35)" },
  [DECK.text]: { tint: "rgba(232,236,255,.07)", border: "rgba(232,236,255,.35)" },
};

export function tintFor(color: string) {
  return TINTS[color] ?? TINTS[DECK.text];
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function amountText(n: number): string {
  if (Math.abs(n) >= 100_000) return fmtCompact(n, 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 });
}

interface FeedCopy {
  title: string;
  tag: { text: string; color: string } | null;
  sub: string;
}

/** Title / tag / sub-line per event type, in the design's wording. */
export function feedCopy(e: CdaEvent): FeedCopy {
  const venue = e.venue ?? "";
  const join = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");
  switch (e.type) {
    case "liquidation": {
      const side = (e.side ?? "").toLowerCase();
      const long = side === "long";
      return {
        title: side ? `${cap(side)} liquidated` : "Liquidation",
        tag: side === "long" || side === "short" ? { text: `${side.toUpperCase()} LIQ`, color: long ? DECK.long : DECK.short } : null,
        sub: join([typeof e.px === "number" && `@ ${fmtPrice(e.px)}`, typeof e.sz === "number" && `${fmtCompact(e.sz)} ${e.symbol}`, venue]),
      };
    }
    case "whale_position": {
      const action = (e.action ?? "").toLowerCase();
      const verb = action === "entry" || action === "open" ? "opened" : action === "exit" || action === "close" ? "closed" : action === "increase" ? "added to" : action === "decrease" ? "reduced" : action || "changed";
      const side = (e.side ?? "").toLowerCase();
      return {
        title: `Whale ${verb} ${side || "position"}`,
        tag: side === "long" || side === "short" ? { text: side.toUpperCase(), color: side === "long" ? DECK.long : DECK.short } : null,
        sub: join([
          typeof e.size === "number" && `${amountText(e.size)} ${e.symbol}`,
          typeof e.change_pct === "number" && `${fmtPct(e.change_pct, { sign: true })} size`,
          e.address && shortAddress(e.address),
          venue,
        ]),
      };
    }
    case "whale_transfer": {
      const dir = (e.direction ?? "").toLowerCase();
      const ex = cap(e.exchange ?? "exchange");
      const amt = typeof e.amount === "number" ? `${amountText(e.amount)} ${e.symbol}` : e.symbol;
      const title = dir === "outflow" ? `${amt} withdrawn from ${ex}` : dir === "inflow" ? `${amt} deposited to ${ex}` : `${amt} moved`;
      const route = dir === "outflow" ? `${ex} → external wallet` : dir === "inflow" ? `external wallet → ${ex}` : ex;
      return { title, tag: null, sub: join([route, e.chain && `on ${e.chain}`]) };
    }
    case "oi_delta": {
      const win = typeof e.window_s === "number" ? ` in ${Math.round(e.window_s)}s` : "";
      const up = (e.pct ?? e.usd ?? 0) >= 0;
      return {
        title: `OI ${up ? "up" : "down"} ${fmtPct(e.pct, { digits: 3, sign: true })}${win}`,
        tag: null,
        sub: join([typeof e.oi_usd === "number" && `OI ${fmtUsd(e.oi_usd)}`, venue]),
      };
    }
    case "price_move": {
      const win = typeof e.window_s === "number" ? ` in ${Math.round(e.window_s)}s` : "";
      return {
        title: `Price ${(e.pct ?? 0) >= 0 ? "up" : "down"} ${fmtPct(e.pct, { digits: 2, sign: true })}${win}`,
        tag: null,
        sub: join([typeof e.price === "number" && `to ${fmtPrice(e.price)}`, venue]),
      };
    }
    case "funding": {
      const r = typeof e.rate_1h === "number" ? e.rate_1h * 100 : null;
      const prev = typeof e.prev_rate_1h === "number" ? e.prev_rate_1h * 100 : null;
      return {
        title: r === null ? "Funding update" : `Funding ${e.settle ? "settled at" : "moved to"} ${fmtPct(r, { digits: 4, sign: true })}/h`,
        tag: null,
        sub: join([r !== null && `annualised ${fmtPct(r * 24 * 365, { digits: 1, sign: true })}`, prev !== null && `prev ${fmtPct(prev, { digits: 4, sign: true })}`, venue]),
      };
    }
    default:
      return { title: e.type, tag: null, sub: venue };
  }
}

const COLS = "md:grid-cols-[82px_150px_130px_minmax(0,1fr)_auto]";

function EventRowImpl({ event, now, fresh, highlight }: { event: CdaEvent; now: number; fresh: boolean; highlight: boolean }) {
  const type = isEventType(event.type) ? event.type : null;
  const style = type ? TYPE_STYLE[type] : { glyph: "•", color: DECK.muted };
  const t = tintFor(style.color);
  const copy = feedCopy(event);
  const usd = typeof event.usd === "number" ? Math.abs(event.usd) : null;
  const tone = eventTone(event);
  const dot = usd === null ? "transparent" : event.type === "liquidation" ? DECK.amber : tone === "long" ? DECK.long : tone === "short" ? DECK.short : DECK.muted;
  const href = `/coin/${encodeURIComponent(event.symbol)}`;

  return (
    <div
      className={`grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-b border-iris/7 px-3.5 py-[13px] md:gap-4 md:px-[18px] ${COLS}`}
      style={{
        background: fresh ? t.tint : "transparent",
        boxShadow: fresh ? `inset 3px 0 0 ${style.color}` : "none",
        transition: "background 1.2s, box-shadow 1.2s",
      }}
    >
      <div className="flex flex-col gap-0.5 font-mono">
        <span className="text-[13px] text-ink">{fmtClock(event.ts)}</span>
        <span className="text-[10.5px] text-ink-dim">{event.origin === "delayed" ? "delayed" : relTime(event.ts, now)}</span>
      </div>
      <div className="hidden md:block">
        <span
          className="inline-flex items-center gap-[7px] rounded-[8px] border px-2.5 py-[5px] text-[12px] font-semibold whitespace-nowrap"
          style={{ color: style.color, background: t.tint, borderColor: t.border }}
        >
          <span className="text-[12px]">{style.glyph}</span>
          {type ? EVENT_LABEL[type] : event.type}
        </span>
      </div>
      <Link href={href} className="hidden min-w-0 items-center gap-[9px] text-ink hover:opacity-80 md:flex">
        <CoinLogo symbol={event.symbol} size={24} style={{ boxShadow: "0 0 0 1px rgba(255,255,255,.08)" }} />
        <span className="truncate font-display text-[14px] font-bold">{event.symbol}</span>
      </Link>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={href} className="shrink-0 font-display text-[13px] font-bold text-ink md:hidden" style={{ color: style.color }}>
            {style.glyph} {event.symbol}
          </Link>
          <span className="truncate text-[14px] font-semibold">{copy.title}</span>
          {copy.tag && (
            <span
              className="shrink-0 rounded-[5px] border px-[7px] py-0.5 font-mono text-[10px] font-semibold tracking-[.08em]"
              style={{ color: copy.tag.color, borderColor: copy.tag.color }}
            >
              {copy.tag.text}
            </span>
          )}
        </div>
        <span className="truncate text-[12px] text-ink-muted">{copy.sub || " "}</span>
      </div>
      <div className="flex items-center gap-2 justify-self-end font-mono text-[14px] font-semibold">
        <span className="size-[7px] rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
        <span style={{ color: usd === null ? DECK.dim : DECK.bright, textShadow: highlight && usd !== null ? `0 0 12px ${dot}` : undefined }}>
          {usd === null ? "—" : fmtUsd(usd)}
        </span>
      </div>
    </div>
  );
}

export const EventRow = memo(EventRowImpl);
