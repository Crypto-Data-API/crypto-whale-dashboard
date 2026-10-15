"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SidebarIcon, WhaleMark } from "@/components/deck/icons";
import { useSettingsHydrated } from "@/hooks/use-hydrated";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useStream } from "@/stores/stream";
import { CoinSearch } from "./coin-search";
import { NAV_ITEMS, isActive } from "./nav";
import { ApiUsage, KeySourceLine, LiveIndicator, TierPill } from "./status-widgets";

const WHALE_TYPES = new Set(["whale_position", "whale_transfer", "liquidation"]);
const ALERT_WINDOW_MS = 10 * 60_000;

const SIDEBAR_ID = "app-sidebar";

/** Hides or shows the desktop sidebar. `floating` is the copy pinned top-left while the sidebar is hidden. */
export function SidebarToggle({ floating = false }: { floating?: boolean }) {
  const hidden = useSettings((s) => s.sidebarHidden);
  const setHidden = useSettings((s) => s.setSidebarHidden);
  const label = hidden ? "Show sidebar" : "Hide sidebar";
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      title={label}
      aria-label={label}
      aria-controls={SIDEBAR_ID}
      aria-expanded={!hidden}
      className={cn(
        "grid shrink-0 cursor-pointer place-items-center rounded-[10px] border text-ink-soft transition-colors hover:border-long/40 hover:text-long",
        floating
          ? "fixed top-[30px] left-3.5 z-40 hidden size-9 border-iris/16 bg-[rgba(6,7,14,.85)] backdrop-blur-[12px] lg:grid"
          : // Tucked into the rail's top-right corner, level with the logo, clear of the brand text.
            "absolute top-7 right-1 size-[26px] border-transparent hover:bg-iris/8",
      )}
    >
      <SidebarIcon size={floating ? 18 : 16} open={!hidden} />
    </button>
  );
}

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
          WHALE<span className="text-long [text-shadow:0_0_12px_rgba(0,245,212,.6)]">DESK</span>
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

/** Desktop rail (lg and up). Slides shut when hidden; the page reflows into the freed width. */
export function Sidebar() {
  const hidden = useSettings((s) => s.sidebarHidden);
  const hydrated = useSettingsHydrated();
  // Only slide on user toggles, not when the saved state is applied on load.
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    if (!hydrated) return;
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(id);
  }, [hydrated]);
  return (
    <aside
      id={SIDEBAR_ID}
      inert={hidden}
      className={cn(
        "sticky top-0 z-40 hidden h-dvh shrink-0 overflow-hidden bg-[rgba(6,7,14,.75)] backdrop-blur-[12px] lg:block",
        hidden ? "w-0 border-r-0" : "w-[236px] border-r border-iris/10",
        animate && "transition-[width] duration-200 ease-out motion-reduce:transition-none",
      )}
    >
      <div className="relative flex h-full w-[236px] flex-col overflow-y-auto px-3.5 py-[18px]">
        <SidebarToggle />
        <SidebarBody />
      </div>
    </aside>
  );
}
