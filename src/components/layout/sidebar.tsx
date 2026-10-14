"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { WhaleMark } from "@/components/deck/icons";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useStream } from "@/stores/stream";
import { CoinSearch } from "./coin-search";
import { NAV_ITEMS, isActive } from "./nav";
import { ApiUsage, KeySourceLine, LiveIndicator, TierPill } from "./status-widgets";

const WHALE_TYPES = new Set(["whale_position", "whale_transfer", "liquidation"]);
const ALERT_WINDOW_MS = 10 * 60_000;

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-1.5 pt-1 pb-[22px]">
      <span
        className="grid size-[38px] shrink-0 place-items-center rounded-[11px]"
        style={{
          background: "linear-gradient(135deg,#00f5d4,#4d7cff 55%,#ff2d75)",
          boxShadow: "0 0 22px rgba(0,245,212,.35),0 0 40px rgba(255,45,117,.2)",
        }}
      >
        <WhaleMark size={24} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-[16px] font-bold tracking-[.04em] text-ink">
          WHALE<span className="text-long [text-shadow:0_0_12px_rgba(0,245,212,.6)]">DECK</span>
        </span>
        <span className="text-[11px] text-ink-muted">powered by CryptoDataApi</span>
      </span>
    </Link>
  );
}

/** Whale position / transfer / liquidation events received in the last 10 minutes. */
function useRecentAlertCount(): number {
  const events = useStream((s) => s.events);
  const now = useNow(5000);
  return useMemo(() => {
    if (!now) return 0;
    const cutoff = now - ALERT_WINDOW_MS;
    let n = 0;
    // Events are ordered by id, which tracks time; stop once well past the window.
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const t = e.recv_ts ?? e.ts;
      if (t < cutoff - 60_000) break;
      if (t >= cutoff && WHALE_TYPES.has(e.type)) n++;
    }
    return n;
  }, [events, now]);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const alertCount = useRecentAlertCount();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[10px] border px-3 py-[11px] text-[14px] transition-colors",
              active
                ? "border-long/25 font-semibold text-ink shadow-[inset_3px_0_0_#00f5d4]"
                : "border-transparent font-normal text-ink-soft hover:bg-iris/8 hover:text-ink",
            )}
            style={active ? { background: "linear-gradient(90deg,rgba(0,245,212,.14),rgba(0,245,212,0))" } : undefined}
          >
            <Icon size={17} className={active ? "text-long" : undefined} />
            {item.label}
            {item.alertCount && alertCount > 0 && (
              <span
                className="ml-auto rounded-[20px] border border-short/35 bg-short/16 px-[7px] py-0.5 font-mono text-[10px] font-normal text-short-soft"
                title={`${alertCount} whale events in the last 10 minutes`}
              >
                {alertCount > 999 ? "999+" : alertCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Everything inside the sidebar; shared by the desktop rail and the mobile drawer. */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <Brand onNavigate={onNavigate} />
      <CoinSearch className="mx-0.5 mb-5" onNavigate={onNavigate} />
      <div className="px-2.5 pb-2 font-mono text-[10px] tracking-[.18em] text-ink-dimmer">MONITOR</div>
      <SidebarNav onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-3 rounded-[12px] border border-iris/12 bg-well px-3 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <LiveIndicator />
          <TierPill />
        </div>
        <ApiUsage />
        <KeySourceLine />
      </div>
      <div className="mt-2 rounded-[12px] border border-iris/12 bg-well p-3 text-[11px] leading-normal text-ink-muted">
        Data from{" "}
        <a href="https://cryptodataapi.com" target="_blank" rel="noopener noreferrer" className="text-long hover:text-long-hover">
          cryptodataapi.com
        </a>
        . Not financial advice.
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-40 hidden h-dvh w-[236px] shrink-0 flex-col overflow-y-auto border-r border-iris/10 bg-[rgba(6,7,14,.75)] px-3.5 py-[18px] backdrop-blur-[12px] lg:flex">
      <SidebarBody />
    </aside>
  );
}
