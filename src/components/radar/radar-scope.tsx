"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CoinLogo } from "@/components/deck/coin-logo";
import { fmtUsd } from "@/lib/format";
import { DECK } from "@/lib/palette";
import { MAJOR_GROSS_USD, blipAngle, blipPosition, blipSize, type RadarCoin } from "./radar-model";

const TICKS: [number, string][] = [
  [-91.5, "100"],
  [-68.6, "87.5"],
  [-46, "75"],
  [-23.5, "62.5"],
  [26, "37.5"],
  [48.5, "25"],
  [71, "12.5"],
  [94.5, "0"],
];

/**
 * Positioning radar. Top half = long-leaning vs the coin's own 30-day range,
 * bottom half = short-leaning; distance from centre = how extreme; blip size =
 * gross whale notional. Clicking a blip selects it.
 */
export function RadarScope({
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
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // Blip sizes follow the design at full size and shrink on small radars (phones).
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 600;
      setScale(Math.max(0.55, Math.min(1, w / 600)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const blips = useMemo(() => {
    const maxGross = Math.max(1, ...coins.map((c) => c.gross));
    return coins.map((c) => {
      const pos = blipPosition(c.pct, blipAngle(c.symbol));
      return { c, ...pos, px: Math.round(blipSize(c.gross, maxGross) * scale), color: c.long ? DECK.long : DECK.short };
    });
  }, [coins, scale]);

  const sel = blips.find((b) => b.c.symbol === selected) ?? null;

  return (
    <div ref={boxRef} className="relative mx-auto aspect-square" style={{ width: "min(100%, max(560px, calc(100vh - 190px)))" }}>
      <svg viewBox="-100 -100 200 200" className="absolute inset-0 size-full overflow-visible select-none" aria-hidden>
        <defs>
          <radialGradient id={`${uid}top`} cx="0" cy="0" r="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00f5d4" stopOpacity=".02" />
            <stop offset="1" stopColor="#00f5d4" stopOpacity=".12" />
          </radialGradient>
          <radialGradient id={`${uid}bot`} cx="0" cy="0" r="90" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ff2d75" stopOpacity=".02" />
            <stop offset="1" stopColor="#ff2d75" stopOpacity=".12" />
          </radialGradient>
          <linearGradient id={`${uid}sweep`} x1="0" y1="-90" x2="-58" y2="-69" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#7dfff0" stopOpacity=".38" />
            <stop offset="1" stopColor="#7dfff0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M-90 0 A90 90 0 0 1 90 0 Z" fill={`url(#${uid}top)`} />
        <path d="M-90 0 A90 90 0 0 0 90 0 Z" fill={`url(#${uid}bot)`} />
        <circle r="90" fill="none" stroke="#4d7cff" strokeOpacity=".55" strokeWidth=".5" style={{ filter: "drop-shadow(0 0 2px #4d7cff)" }} />
        <circle r="67.5" fill="none" stroke="#8a90b4" strokeOpacity=".18" strokeWidth=".3" />
        <circle r="45" fill="none" stroke="#8a90b4" strokeOpacity=".18" strokeWidth=".3" />
        <circle r="22.5" fill="none" stroke="#8a90b4" strokeOpacity=".18" strokeWidth=".3" strokeDasharray="1 1.5" />
        <path d="M-90 0H90" stroke="#a3a9cc" strokeOpacity=".35" strokeWidth=".35" />
        <path d="M0 -90V90" stroke="#8a90b4" strokeOpacity=".15" strokeWidth=".3" />
        <path d="M-63.6 -63.6L63.6 63.6M63.6 -63.6L-63.6 63.6" stroke="#8a90b4" strokeOpacity=".07" strokeWidth=".3" />
        <g className="radar-sweep">
          <path d="M0 0L0 -90A90 90 0 0 0 -57.85 -68.94Z" fill={`url(#${uid}sweep)`} />
          <line x1="0" y1="0" x2="0" y2="-90" stroke="#7dfff0" strokeWidth=".6" style={{ filter: "drop-shadow(0 0 2px #00f5d4)" }} />
        </g>
        <g className="font-mono" fontSize="3.4" fill="#6d7399">
          {TICKS.map(([y, t]) => (
            <text key={t} x="1.6" y={y}>
              {t}
            </text>
          ))}
        </g>
        <text x="-88" y="-3" className="font-display" fontWeight="700" fontSize="4.2" letterSpacing=".6" fill="#00f5d4" style={{ filter: "drop-shadow(0 0 2px rgba(0,245,212,.8))" }}>
          LONG-LEANING
        </text>
        <text x="-88" y="6.5" className="font-display" fontWeight="700" fontSize="4.2" letterSpacing=".6" fill="#ff2d75" style={{ filter: "drop-shadow(0 0 2px rgba(255,45,117,.8))" }}>
          SHORT-LEANING
        </text>
      </svg>

      <div className="absolute inset-0" role="group" aria-label="Whale positioning radar">
        {sel && (
          <div
            className="blip-pulse pointer-events-none absolute rounded-full"
            style={{ left: `${sel.left}%`, top: `${sel.top}%`, width: 60 * scale, height: 60 * scale, border: `2px solid ${sel.color}`, transform: "translate(-50%,-50%)" }}
            aria-hidden
          />
        )}
        {blips.map((b) => {
          const sym = b.c.symbol;
          const isSel = sym === selected;
          const isHov = sym === hover;
          const hot = isSel || isHov;
          const showLabel = hot || b.c.gross >= MAJOR_GROSS_USD;
          const shadow = `0 0 ${hot ? 22 : 10}px ${b.color}${hot ? "" : "aa"}${isSel ? ", 0 0 0 4px rgba(255,255,255,.18)" : ""}`;
          const lean = b.c.long ? "long-leaning" : "short-leaning";
          const pctText = b.c.usedFallback ? `long share ${b.c.pct.toFixed(1)}%` : `30-day percentile ${b.c.pct.toFixed(0)}`;
          return (
            <button
              key={sym}
              type="button"
              aria-pressed={isSel}
              aria-label={`${sym}: ${lean}, ${pctText}, gross ${fmtUsd(b.c.gross)}`}
              onClick={() => onSelect(sym)}
              onMouseEnter={() => setHover(sym)}
              onMouseLeave={() => setHover((h) => (h === sym ? null : h))}
              onFocus={() => setHover(sym)}
              onBlur={() => setHover((h) => (h === sym ? null : h))}
              className="absolute grid cursor-pointer place-items-center rounded-full p-0 outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              style={{
                left: `${b.left}%`,
                top: `${b.top}%`,
                width: b.px,
                height: b.px,
                transform: "translate(-50%,-50%)",
                background: DECK.logoBg,
                border: `2px solid ${b.color}`,
                boxShadow: shadow,
                zIndex: hot ? 50 : b.px,
                transition: "left .9s cubic-bezier(.2,.8,.2,1), top .9s cubic-bezier(.2,.8,.2,1), box-shadow .2s",
              }}
            >
              <CoinLogo symbol={sym} size={Math.max(8, Math.round((b.px - 4) * 0.78))} />
              {showLabel && (
                <span
                  className="pointer-events-none absolute top-1/2 left-[calc(100%+5px)] -translate-y-1/2 font-display font-bold tracking-[.04em] whitespace-nowrap text-ink-bright"
                  style={{ fontSize: b.px >= 26 ? 14 : 12, textShadow: `0 0 10px ${b.color}, 0 1px 2px #000` }}
                >
                  {sym}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {sample && (
        <span className="absolute top-1 left-1 rounded-[6px] border border-gold/40 bg-deck/80 px-2 py-0.5 font-mono text-[10px] tracking-[.1em] text-gold">
          SAMPLE DATA
        </span>
      )}
    </div>
  );
}

export function RadarLegend() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-[22px] gap-y-2 text-[11.5px] text-ink-soft">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-long shadow-[0_0_8px_#00f5d4]" />
        Long-leaning vs 30-day range
      </div>
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-short shadow-[0_0_8px_#ff2d75]" />
        Short-leaning vs 30-day range
      </div>
    </div>
  );
}
