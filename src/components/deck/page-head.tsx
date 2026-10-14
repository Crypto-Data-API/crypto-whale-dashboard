"use client";

import type { ReactNode } from "react";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { deckButton } from "./button";
import { RefreshIcon } from "./icons";

/** Page title row: h1 on the left, actions pushed right, bottoms aligned. */
export function PageHead({ title, right, above, className }: { title: ReactNode; right?: ReactNode; above?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end gap-5", className)}>
      <div className="flex min-w-0 flex-col gap-3">
        {above}
        <h1 className="m-0 font-display text-[32px] leading-none font-bold tracking-[.01em] sm:text-[40px]">{title}</h1>
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center gap-3.5">{right}</div>}
    </div>
  );
}

/** "Updated 1m 12s ago" in mono, ticking every second. */
export function UpdatedAgo({ ts }: { ts: number | null | undefined }) {
  const now = useNow(1000);
  let text = "—";
  if (ts && now > 0) {
    const s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 3600) {
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      text = mm > 0 ? `${mm}m ${ss}s ago` : `${ss}s ago`;
    } else {
      const h = Math.floor(s / 3600);
      text = h < 48 ? `${h}h ${Math.floor((s % 3600) / 60)}m ago` : `${Math.floor(h / 24)}d ago`;
    }
  }
  return (
    <div className="font-mono text-[12px] text-ink-muted">
      Updated <span className="text-ink">{text}</span>
    </div>
  );
}

export function RefreshButton({ onClick, busy = false, label = "REFRESH" }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} className={deckButton({ variant: "primary", className: "disabled:opacity-70" })}>
      <RefreshIcon className={busy ? "animate-spin" : undefined} />
      {label}
    </button>
  );
}
