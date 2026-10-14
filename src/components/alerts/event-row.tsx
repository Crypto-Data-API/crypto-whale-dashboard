"use client";

import Link from "next/link";
import { memo } from "react";
import { Activity, ArrowLeftRight, Fish, Flame, Percent, TrendingUp, type LucideIcon } from "lucide-react";
import { describeEvent, eventTone, positionFlow, type Tone } from "@/lib/events";
import { EVENT_LABEL, isEventType, type CdaEvent, type EventType } from "@/lib/cda/types";
import { fmtClock, fmtUsd, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const TYPE_META: Record<EventType, { icon: LucideIcon; accent: string; chip: string }> = {
  whale_position: { icon: Fish, accent: "border-l-position", chip: "bg-position/15 text-position" },
  whale_transfer: { icon: ArrowLeftRight, accent: "border-l-transfer", chip: "bg-transfer/15 text-transfer" },
  liquidation: { icon: Flame, accent: "border-l-liq", chip: "bg-liq/15 text-liq" },
  oi_delta: { icon: Activity, accent: "border-l-context/50", chip: "bg-muted text-muted-foreground" },
  price_move: { icon: TrendingUp, accent: "border-l-context/50", chip: "bg-muted text-muted-foreground" },
  funding: { icon: Percent, accent: "border-l-context/50", chip: "bg-muted text-muted-foreground" },
};

const TONE_DOT: Record<Tone, string> = {
  long: "bg-long",
  short: "bg-short",
  liq: "bg-liq",
  neutral: "bg-muted-foreground",
};

/** Side / direction pill: always a text label, the dot is a secondary cue. */
function sidePill(e: CdaEvent): { label: string; tone: Tone } | null {
  if (e.type === "whale_transfer" && e.direction) {
    const d = e.direction.toLowerCase();
    return { label: d.toUpperCase(), tone: d === "outflow" ? "long" : d === "inflow" ? "short" : "neutral" };
  }
  if (e.type === "whale_position") {
    const flow = positionFlow(e);
    const side = (e.side ?? "").toUpperCase();
    return flow ? { label: `${flow === "buy" ? "BUY" : "SELL"}${side ? ` · ${side}` : ""}`, tone: flow === "buy" ? "long" : "short" } : null;
  }
  if (e.type === "liquidation" && e.side) {
    const s = e.side.toLowerCase();
    return { label: `${s.toUpperCase()} LIQ`, tone: s === "long" ? "long" : s === "short" ? "short" : "neutral" };
  }
  return null;
}

function EventRowImpl({ event, now, highlight }: { event: CdaEvent; now: number; highlight: boolean }) {
  const type = isEventType(event.type) ? event.type : null;
  const meta = type ? TYPE_META[type] : null;
  const Icon = meta?.icon ?? Activity;
  const { headline, detail } = describeEvent(event);
  const pill = sidePill(event);
  const tone = eventTone(event);
  const usd = typeof event.usd === "number" ? event.usd : null;

  return (
    <li
      className={cn(
        "grid grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-l-2 border-b-border px-3 py-2 text-sm sm:grid-cols-[4.75rem_8.5rem_4.5rem_minmax(0,1fr)_6.5rem]",
        meta?.accent ?? "border-l-transparent",
        highlight && "bg-accent/40",
      )}
    >
      <div className="row-span-2 flex flex-col leading-tight sm:row-span-1">
        <span className="tabular text-xs">{fmtClock(event.ts)}</span>
        <span className="text-[10px] text-muted-foreground">
          {event.origin === "delayed" ? "delayed" : relTime(event.ts, now)}
        </span>
      </div>

      <span className={cn("hidden w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex", meta?.chip ?? "bg-muted")}>
        <Icon className="size-3" aria-hidden />
        <span className="text-foreground">{type ? EVENT_LABEL[type] : event.type}</span>
      </span>

      <Link href={`/coin/${encodeURIComponent(event.symbol)}`} className="hidden font-mono text-xs font-semibold hover:underline sm:block">
        {event.symbol}
      </Link>

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <Link href={`/coin/${encodeURIComponent(event.symbol)}`} className="font-mono text-xs font-semibold hover:underline sm:hidden">
            {event.symbol}
          </Link>
          <Icon className={cn("size-3 sm:hidden", meta?.chip.split(" ")[1])} aria-hidden />
          <span className="truncate">{headline}</span>
          {pill && (
            <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 text-[10px] font-semibold tracking-wide">
              <span className={cn("size-1.5 rounded-full", TONE_DOT[pill.tone])} aria-hidden />
              {pill.label}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {detail}
          {event.venue && <span className="ml-1.5 opacity-80">· {event.venue}</span>}
        </div>
      </div>

      <div className="row-span-2 text-right sm:row-span-1">
        {usd !== null ? (
          <span className={cn("tabular", highlight ? "font-semibold" : "")}>
            <span className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", TONE_DOT[tone])} aria-hidden />
            {fmtUsd(Math.abs(usd))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </li>
  );
}

export const EventRow = memo(EventRowImpl);
