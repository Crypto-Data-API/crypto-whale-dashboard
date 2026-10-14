"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAccess } from "@/hooks/use-access";
import { useNow } from "@/hooks/use-now";
import { TIER_LABEL } from "@/lib/cda/types";
import { fmtInt, relTime } from "@/lib/format";
import { DECK } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { useRateLimit } from "@/stores/rate-limit";
import { useStream, type StreamStatus } from "@/stores/stream";

const STATUS_META: Record<StreamStatus, { label: string; color: string; pulse?: boolean; hint: string }> = {
  live: { label: "LIVE", color: DECK.long, pulse: true, hint: "Live" },
  delayed: { label: "DELAYED", color: DECK.amber, hint: "Delayed 30 minutes" },
  connecting: { label: "CONNECTING", color: DECK.amber, hint: "Connecting" },
  reconnecting: { label: "RECONNECTING", color: DECK.amber, hint: "Reconnecting" },
  error: { label: "ERROR", color: DECK.short, hint: "Stream error" },
  off: { label: "OFFLINE", color: DECK.short, hint: "Off" },
  idle: { label: "IDLE", color: DECK.dim, hint: "Idle" },
};

/** Pulsing stream status: LIVE (cyan), DELAYED (amber), OFFLINE / ERROR (pink). */
export function LiveIndicator() {
  const status = useStream((s) => s.status);
  const message = useStream((s) => s.message);
  const count = useStream((s) => s.events.length);
  const lastActivityAt = useStream((s) => s.lastActivityAt);
  const now = useNow(5000);
  const meta = STATUS_META[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/alerts"
          className="flex items-center gap-2 font-mono text-[11px] tracking-[.08em] whitespace-nowrap"
          style={{ color: meta.color }}
        >
          <span
            className={cn("inline-block size-2 shrink-0 rounded-full", meta.pulse && "live-pulse")}
            style={{ background: meta.color, boxShadow: meta.pulse ? undefined : `0 0 8px ${meta.color}` }}
            aria-hidden
          />
          {meta.label}
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        <div className="font-medium">Event stream: {meta.hint}</div>
        {message && <div className="text-muted-foreground">{message}</div>}
        <div className="text-muted-foreground">
          {fmtInt(count)} events buffered · last activity {relTime(lastActivityAt, now)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const PILL = "inline-flex items-center rounded-full px-[9px] py-[3px] font-display text-[10.5px] font-bold tracking-[.06em] whitespace-nowrap";

/** Tier / key-source badge: PRO+ (gradient), PRO, FREE, SAMPLE, DEMO, NO KEY, INVALID. */
export function TierPill() {
  const access = useAccess();
  let label = "…";
  let cls = `${PILL} border border-iris/20 text-ink-dim`;
  let style: CSSProperties | undefined;
  let hint = "Checking your API key";
  if (!access.hydrated) {
    // keep the placeholder
  } else if (access.source === "sample") {
    label = access.demoMode ? "DEMO" : "SAMPLE";
    cls = `${PILL} border border-gold/50 bg-gold/10 text-gold`;
    hint = access.demoMode
      ? "Demo mode: bundled sample snapshots and the 30-minute delayed feed"
      : "No API key yet: showing bundled sample snapshots. Add your CryptoDataApi key in Settings for live data.";
  } else if (access.demoMode && access.source === "none") {
    label = "DEMO";
    cls = `${PILL} border border-gold/50 bg-gold/10 text-gold`;
    hint = "Demo mode: the 30-minute delayed feed only";
  } else if (access.source === "none") {
    label = "NO KEY";
    hint = "Add your CryptoDataApi key in Settings";
  } else if (access.authError?.isAuth) {
    label = "INVALID";
    cls = `${PILL} border border-short/50 bg-short/10 text-short`;
    hint = access.source === "server" ? "The API rejected the server key (CDA_API_KEY)" : "The API rejected this key";
  } else if (access.tier) {
    hint =
      access.source === "server"
        ? `Using the server key (CDA_API_KEY), ${TIER_LABEL[access.tier]} tier. Add your own key in Settings to use it instead.`
        : `${TIER_LABEL[access.tier]} key${access.keyInfo?.keyPrefix ? ` · ${access.keyInfo.keyPrefix}…` : ""}`;
    if (access.tier === "pro_plus") {
      label = "PRO+";
      cls = `${PILL} text-deck`;
      style = { background: "linear-gradient(90deg,#00f5d4,#4d7cff)", boxShadow: "0 0 14px rgba(0,245,212,.4)" };
    } else if (access.tier === "pro") {
      label = "PRO";
      cls = `${PILL} border border-long/50 bg-long/10 text-long`;
      style = { boxShadow: "0 0 12px rgba(0,245,212,.2)" };
    } else {
      label = "FREE";
      cls = `${PILL} border border-iris/30 text-ink-soft`;
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href="/settings" className={cls} style={style}>
          {label}
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}

/** "API today 2,570/50,000" with a thin progress bar (blue, amber > 70%, pink > 90%). */
export function ApiUsage() {
  const rl = useRateLimit();
  const access = useAccess();
  const limitDay = rl.limitDay ?? access.keyInfo?.dailyLimit ?? null;
  const remainingDay =
    rl.remainingDay ??
    (access.keyInfo?.dailyLimit != null && access.keyInfo.requestsToday != null ? access.keyInfo.dailyLimit - access.keyInfo.requestsToday : null);
  const known = limitDay !== null && limitDay > 0 && remainingDay !== null;
  const used = known ? Math.max(0, limitDay - remainingDay) : 0;
  const pct = known ? Math.min(100, (used / limitDay) * 100) : 0;
  const bar = pct > 90 ? DECK.short : pct > 70 ? DECK.amber : DECK.blue;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col gap-[5px]" aria-label={known ? `API usage ${fmtInt(used)} of ${fmtInt(limitDay)} requests today` : "API usage unknown"}>
          <div className="flex justify-between gap-2 text-[11px] text-ink-muted">
            <span>API today</span>
            <span className="font-mono text-ink">
              {known ? fmtInt(used) : "—"}
              {known && <span className="text-ink-dim">/{fmtInt(limitDay)}</span>}
            </span>
          </div>
          <div className="h-[3px] overflow-hidden rounded-[3px] bg-iris/14">
            <div className="h-full" style={{ width: `${known ? Math.max(1.5, pct) : 0}%`, background: bar, boxShadow: `0 0 8px ${bar}` }} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {known ? (
          <>
            <div>
              Daily: {fmtInt(remainingDay)} of {fmtInt(limitDay)} remaining
            </div>
            {rl.limitMinute !== null && rl.remainingMinute !== null && (
              <div>
                This minute: {fmtInt(rl.remainingMinute)} of {fmtInt(rl.limitMinute)} remaining
              </div>
            )}
          </>
        ) : (
          <div>Usage appears after the first API response.</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Where the data comes from: server key, the visitor's key, or the bundled snapshot. */
export function KeySourceLine() {
  const access = useAccess();
  let text = " ";
  if (access.hydrated) {
    if (access.source === "server") text = "Using server key";
    else if (access.source === "user") text = "Using your key";
    else if (access.source === "sample") text = access.demoMode ? "Demo mode · sample data" : "Sample data · add a key";
    else text = "No key · add one in Settings";
  }
  return (
    <Link href="/settings" className="text-[11px] text-ink-muted hover:text-ink">
      {text}
    </Link>
  );
}
