"use client";

import Link from "next/link";
import { deckButton } from "@/components/deck/button";
import { AlertIcon, KeyIcon, LockIcon, RefreshIcon } from "@/components/deck/icons";
import type { Gate } from "@/hooks/use-access";
import type { CdaError } from "@/lib/cda/client";
import { TIER_LABEL, type Tier } from "@/lib/cda/types";
import { cn } from "@/lib/utils";

const PRICING_URL = "https://cryptodataapi.com/pricing";

/** Animated placeholder bar in the deck palette. */
export function DeckSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[10px] bg-iris/8", className)} />;
}

/** Renders the non-"ok" access states in a consistent way. */
export function GateNotice({
  gate,
  requiredTier,
  feature,
  className,
  compact = false,
}: {
  gate: Gate;
  requiredTier?: Tier | null;
  feature: string;
  className?: string;
  compact?: boolean;
}) {
  if (gate === "ok") return null;
  if (gate === "loading") {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        <DeckSkeleton className="h-4 w-1/2" />
        <DeckSkeleton className="h-4 w-3/4" />
        {!compact && <DeckSkeleton className="h-4 w-2/3" />}
      </div>
    );
  }
  const tierLabel = TIER_LABEL[requiredTier ?? "pro"];
  const content =
    gate === "upgrade"
      ? { Icon: LockIcon, title: `Requires ${tierLabel}`, body: `${feature} is included with a ${tierLabel} CryptoDataApi key.` }
      : gate === "invalid-key"
        ? { Icon: AlertIcon, title: "API key rejected", body: "The API did not accept the stored key. Check it in Settings." }
        : { Icon: KeyIcon, title: "Add your API key", body: `${feature} needs a CryptoDataApi key.` };
  const { Icon } = content;
  return (
    <div className={cn("flex items-start gap-3 rounded-[14px] border border-dashed border-iris/20 bg-well p-3.5", className)}>
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-gold/10 text-gold">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="m-0 font-display text-[14px] font-semibold tracking-[.02em]">{content.title}</p>
        {!compact && <p className="m-0 mt-0.5 text-ink-muted">{content.body}</p>}
        <div className="mt-2.5 flex flex-wrap gap-2">
          {gate === "upgrade" ? (
            <a href={PRICING_URL} target="_blank" rel="noreferrer" className={deckButton({ size: "sm" })}>
              SEE PLANS
            </a>
          ) : (
            <Link href="/settings" className={deckButton({ size: "sm" })}>
              {gate === "invalid-key" ? "OPEN SETTINGS" : "ADD YOUR CDA KEY"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

/** Error panel with retry; explains warm-up (503), rate limits (429) and gaps in the sample snapshot. */
export function ErrorState({ error, onRetry, className }: { error: CdaError | null; onRetry?: () => void; className?: string }) {
  if (!error) return null;
  const notInSample = error.code === "not_in_sample";
  let title = "Could not load data";
  if (notInSample) title = "Not in the sample snapshot";
  else if (error.isWarming) title = "Dataset warming up";
  else if (error.isRateLimited) title = "Rate limit reached";
  else if (error.status === 0) title = "Connection problem";
  const retryNote = error.retryAfter ? ` Try again in ~${Math.ceil(error.retryAfter)}s.` : "";
  return (
    <div className={cn("flex items-start gap-3 rounded-[14px] border border-gold/30 bg-gold/5 p-3.5 text-[13px]", className)} role="status">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[8px] bg-gold/10 text-gold">
        <AlertIcon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 font-display text-[14px] font-semibold tracking-[.02em]">{title}</p>
        <p className="m-0 mt-0.5 text-ink-muted">
          {error.message}
          {retryNote}
        </p>
        {notInSample ? (
          <a href={PRICING_URL} target="_blank" rel="noopener noreferrer" className={deckButton({ size: "sm", className: "mt-2" })}>
            GET A KEY →
          </a>
        ) : (
          onRetry && (
            <button type="button" onClick={onRetry} className={deckButton({ variant: "ghost", size: "sm", className: "mt-2" })}>
              <RefreshIcon size={12} /> RETRY
            </button>
          )
        )}
      </div>
    </div>
  );
}
