"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/deck/icons";
import { cn } from "@/lib/utils";
import { createOcean, oceanMatch, type OceanHandle, type OceanInputs } from "./ocean-scene";
import type { RadarCoin } from "./radar-model";

function FullscreenIcon({ exit }: { exit: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={exit ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"} />
    </svg>
  );
}

const BADGE = "pointer-events-none absolute left-3.5 z-[4] rounded-[8px] border bg-[rgba(5,6,11,.72)] px-[11px] py-1.5 font-display text-[12.5px] font-bold tracking-[.12em] backdrop-blur-[6px]";

/**
 * The WhaleDesk ocean: a three.js scene (loaded on demand) with a search that
 * dims non-matching whales, a fullscreen toggle and the surface / thermocline /
 * abyss depth markers. Clicking a whale or its label selects the coin.
 */
export function WhaleOcean({
  coins,
  selected,
  onSelect,
  sample = false,
}: {
  coins: RadarCoin[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  sample?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [query, setQuery] = useState("");
  const [nativeFs, setNativeFs] = useState(false);
  const [pseudoFs, setPseudoFs] = useState(false);
  const fs = nativeFs || pseudoFs;

  const inputs = useRef<OceanInputs>({ coins, selected, query });
  const pick = useRef(onSelect);
  useEffect(() => {
    inputs.current = { coins, selected, query };
    pick.current = onSelect;
  });

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    let cancelled = false;
    let handle: OceanHandle | null = null;
    import("three")
      .then((THREE) => {
        if (cancelled) return;
        handle = createOcean(
          THREE,
          el,
          () => inputs.current,
          (s) => pick.current(s),
        );
        setStatus("ready");
      })
      .catch((err: unknown) => {
        console.warn("WhaleDesk ocean failed", err);
        if (!cancelled) setStatus("failed");
      });
    return () => {
      cancelled = true;
      handle?.dispose();
    };
  }, []);

  useEffect(() => {
    const onFs = () => setNativeFs(!!document.fullscreenElement && document.fullscreenElement === boxRef.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPseudoFs(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const toggleFs = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (pseudoFs) {
      setPseudoFs(false);
      return;
    }
    const b = boxRef.current;
    if (!b) return;
    // Fall back to a fixed full-window box where the Fullscreen API is missing (iOS Safari) or refused.
    if (document.fullscreenEnabled && b.requestFullscreen) b.requestFullscreen().catch(() => setPseudoFs(true));
    else setPseudoFs(true);
  };

  const q = query.trim();
  const matches = q ? oceanMatch(coins, q) : coins;

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label="Whale ocean: long-leaning coins swim near the surface, short-leaning coins dive deep"
      className={cn(
        "relative w-full overflow-hidden shadow-[inset_0_0_90px_rgba(0,0,0,.65)] [&:fullscreen]:rounded-none",
        pseudoFs ? "fixed inset-0 z-[9999] h-dvh w-screen rounded-none" : "h-[max(520px,calc(100vh-196px))] rounded-[12px]",
      )}
      style={{ background: "linear-gradient(180deg,#0b3c4e 0%,#07283a 12%,#06162c 38%,#050a1a 60%,#0b0718 84%,#1c0822 100%)" }}
    >
      {status !== "ready" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center font-mono text-[12px] tracking-[.18em] text-ink-dim">
          {status === "loading" ? "LOADING OCEAN…" : "OCEAN UNAVAILABLE · THIS BROWSER HAS WEBGL TURNED OFF"}
        </div>
      )}
      <div ref={mountRef} className="absolute inset-0" />

      <div className="absolute top-3 right-3 z-[6] flex items-center gap-2">
        <label className="flex h-9 w-[min(210px,calc(100vw-140px))] items-center gap-2 rounded-[10px] border border-long/35 bg-[rgba(5,6,11,.65)] px-3 shadow-[0_0_14px_rgba(0,245,212,.12)] backdrop-blur-[6px]">
          <SearchIcon size={14} strokeWidth={2.2} className="shrink-0 text-long" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = oceanMatch(coins, query)[0];
                if (q && first) onSelect(first.symbol);
              } else if (e.key === "Escape" && query) {
                // First Esc clears the search; the next one leaves fullscreen.
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Find a whale (BTC…)"
            aria-label="Find a whale"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 border-none bg-transparent font-mono text-[12px] text-ink outline-none"
          />
          {q && <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-muted">{matches.length} found</span>}
        </label>
        <button
          type="button"
          onClick={toggleFs}
          title={fs ? "Exit fullscreen (Esc)" : "Fullscreen"}
          aria-label={fs ? "Exit fullscreen" : "Fullscreen"}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-long/35 bg-[rgba(5,6,11,.65)] text-long shadow-[0_0_14px_rgba(0,245,212,.15)] backdrop-blur-[6px] transition-[background,box-shadow] hover:bg-long/14 hover:shadow-[0_0_22px_rgba(0,245,212,.4)]"
        >
          <FullscreenIcon exit={fs} />
        </button>
      </div>

      <div className="pointer-events-none absolute top-1/2 right-[58px] left-0 border-t border-dashed border-[rgba(232,236,255,.16)]" />
      <div className="pointer-events-none absolute top-[calc(50%-22px)] left-4 font-mono text-[10.5px] tracking-[.16em] text-ink-muted">THERMOCLINE · NEUTRAL</div>
      <div className={cn(BADGE, "top-14 border-long/30 text-long [text-shadow:0_0_10px_rgba(0,245,212,.6)] sm:top-10")}>▲ SURFACE · EXTREME LONG</div>
      <div className={cn(BADGE, "bottom-[52px] border-short/30 text-short [text-shadow:0_0_10px_rgba(255,45,117,.6)]")}>▼ ABYSS · EXTREME SHORT</div>
      {sample && (
        <span className="pointer-events-none absolute right-3 bottom-3 z-[4] rounded-[6px] border border-gold/40 bg-deck/80 px-2 py-0.5 font-mono text-[10px] tracking-[.1em] text-gold">
          SAMPLE DATA
        </span>
      )}
    </div>
  );
}

export function OceanLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2 text-[11.5px] text-ink-soft">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-long shadow-[0_0_8px_#00f5d4]" />
        Long-leaning · swims near the surface
      </div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-short shadow-[0_0_8px_#ff2d75]" />
        Short-leaning · dives deep
      </div>
    </div>
  );
}
