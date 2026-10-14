"use client";

import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAccess } from "@/hooks/use-access";
import { useNow } from "@/hooks/use-now";
import { TIER_LABEL } from "@/lib/cda/types";
import { fmtInt, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRateLimit } from "@/stores/rate-limit";
import { useStream, type StreamStatus } from "@/stores/stream";

export function TierBadge() {
  const access = useAccess();
  let label = "…";
  let tone = "border-border text-muted-foreground";
  let hint = "Checking your API key";
  if (!access.hydrated) {
    label = "…";
  } else if (access.demoMode && access.source === "none") {
    label = "Demo";
    tone = "border-liq/40 text-liq";
    hint = "Demo mode: sample data and the 30-minute delayed feed";
  } else if (access.source === "none") {
    label = "No key";
    tone = "border-border text-muted-foreground";
    hint = "Add your CryptoDataApi key in Settings";
  } else if (access.authError?.isAuth) {
    label = "Invalid key";
    tone = "border-short/50 text-short";
    hint = "The API rejected this key";
  } else if (access.tier) {
    label = access.tier === "pro_plus" ? "Pro+" : TIER_LABEL[access.tier];
    tone = access.tier === "free" ? "border-border text-foreground" : "border-transfer/50 text-transfer";
    hint = `${TIER_LABEL[access.tier]} key${access.source === "server" ? " (server demo key)" : ""}${access.keyInfo?.keyPrefix ? ` · ${access.keyInfo.keyPrefix}…` : ""}`;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/settings"
          className={cn("inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", tone)}
        >
          {label}
        </Link>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

export function RateLimitMeter() {
  const rl = useRateLimit();
  const access = useAccess();
  const limitDay = rl.limitDay ?? access.keyInfo?.dailyLimit ?? null;
  const remainingDay = rl.remainingDay ?? (access.keyInfo?.dailyLimit != null && access.keyInfo.requestsToday != null ? access.keyInfo.dailyLimit - access.keyInfo.requestsToday : null);
  if (limitDay === null || remainingDay === null) return null;
  const used = Math.max(0, limitDay - remainingDay);
  const pct = limitDay > 0 ? Math.min(100, (used / limitDay) * 100) : 0;
  const barTone = pct > 90 ? "bg-short" : pct > 70 ? "bg-liq" : "bg-transfer";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hidden min-w-28 flex-col gap-1 sm:flex" aria-label={`API usage ${fmtInt(used)} of ${fmtInt(limitDay)} requests today`}>
          <div className="flex items-baseline justify-between gap-2 text-[11px] leading-none text-muted-foreground">
            <span>API today</span>
            <span className="tabular text-foreground">
              {fmtInt(used)}
              <span className="text-muted-foreground">/{fmtInt(limitDay)}</span>
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", barTone)} style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        <div>
          Daily: {fmtInt(remainingDay)} of {fmtInt(limitDay)} remaining
        </div>
        {rl.limitMinute !== null && rl.remainingMinute !== null && (
          <div>
            This minute: {fmtInt(rl.remainingMinute)} of {fmtInt(rl.limitMinute)} remaining
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const STATUS_META: Record<StreamStatus, { label: string; dot: string; pulse?: boolean }> = {
  idle: { label: "Idle", dot: "bg-muted-foreground" },
  off: { label: "Off", dot: "bg-muted-foreground" },
  connecting: { label: "Connecting", dot: "bg-liq", pulse: true },
  reconnecting: { label: "Reconnecting", dot: "bg-liq", pulse: true },
  live: { label: "Live", dot: "bg-long", pulse: true },
  delayed: { label: "Delayed 30m", dot: "bg-liq" },
  error: { label: "Stream error", dot: "bg-short" },
};

export function StreamStatusDot() {
  const status = useStream((s) => s.status);
  const message = useStream((s) => s.message);
  const count = useStream((s) => s.events.length);
  const lastActivityAt = useStream((s) => s.lastActivityAt);
  const now = useNow(5000);
  const meta = STATUS_META[status];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href="/alerts" className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground hover:text-foreground">
          <span className="relative flex size-2">
            {meta.pulse && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", meta.dot)} />}
            <span className={cn("relative inline-flex size-2 rounded-full", meta.dot)} />
          </span>
          <span className="hidden lg:inline">{meta.label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs">
        <div className="font-medium">Event stream: {meta.label}</div>
        {message && <div className="text-muted-foreground">{message}</div>}
        <div className="text-muted-foreground">
          {fmtInt(count)} events buffered · last activity {relTime(lastActivityAt, now)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
