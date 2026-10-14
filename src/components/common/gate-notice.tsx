"use client";

import Link from "next/link";
import { KeyRound, Lock, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Gate } from "@/hooks/use-access";
import type { CdaError } from "@/lib/cda/client";
import { TIER_LABEL, type Tier } from "@/lib/cda/types";
import { cn } from "@/lib/utils";

const PRICING_URL = "https://cryptodataapi.com/pricing";

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
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        {!compact && <Skeleton className="h-4 w-2/3" />}
      </div>
    );
  }
  const tierLabel = TIER_LABEL[requiredTier ?? "pro"];
  const content =
    gate === "upgrade"
      ? {
          icon: Lock,
          title: `Requires ${tierLabel}`,
          body: `${feature} is included with a ${tierLabel} CryptoDataApi key.`,
        }
      : gate === "invalid-key"
        ? {
            icon: TriangleAlert,
            title: "API key rejected",
            body: "The API did not accept the stored key. Check it in Settings.",
          }
        : {
            icon: KeyRound,
            title: "Add your API key",
            body: `${feature} needs a CryptoDataApi key.`,
          };
  const Icon = content.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/20 p-3", className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{content.title}</p>
        {!compact && <p className="mt-0.5 text-muted-foreground">{content.body}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {gate === "upgrade" ? (
            <Button asChild size="xs" variant="secondary">
              <a href={PRICING_URL} target="_blank" rel="noreferrer">
                See plans
              </a>
            </Button>
          ) : (
            <Button asChild size="xs" variant="secondary">
              <Link href="/settings">{gate === "invalid-key" ? "Open Settings" : "Add your CDA key"}</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Error panel with retry; explains warm-up (503) and rate limits (429). */
export function ErrorState({ error, onRetry, className }: { error: CdaError | null; onRetry?: () => void; className?: string }) {
  if (!error) return null;
  let title = "Could not load data";
  if (error.isWarming) title = "Dataset warming up";
  else if (error.isRateLimited) title = "Rate limit reached";
  else if (error.status === 0) title = "Connection problem";
  const retryNote = error.retryAfter ? ` Try again in ~${Math.ceil(error.retryAfter)}s.` : "";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm", className)} role="status">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-liq" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-muted-foreground">
          {error.message}
          {retryNote}
        </p>
        {onRetry && (
          <Button size="xs" variant="ghost" className="mt-1 -ml-2" onClick={onRetry}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}
