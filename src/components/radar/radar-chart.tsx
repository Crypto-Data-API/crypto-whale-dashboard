"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { WhaleCoin } from "@/lib/cda/types";
import { fmtPct, fmtUsd } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";

const SIZE = 400;
const C = SIZE / 2;
const R = 176;
const MIN_ANGLE = (10 * Math.PI) / 180;
const MAX_ANGLE = Math.PI - MIN_ANGLE;
const LABEL_COUNT = 16;
const PING_COUNT = 3;

interface Blip {
  coin: WhaleCoin;
  lean: "long" | "short";
  /** percentile used for placement (30d pctile, else raw long %) */
  p: number;
  usedFallback: boolean;
  x: number;
  y: number;
  r: number;
  labelled: boolean;
  ping: boolean;
}

/**
 * Hemisphere = lean vs the coin's own 30-day norm (top = long-leaning, bottom = short-leaning).
 * Radius = |percentile - 50| / 50, so the rim is the most extreme reading of the month.
 * Blip area ~ gross notional. Angles are spread evenly (alphabetical) inside each half.
 */
function layout(coins: WhaleCoin[]): Blip[] {
  const usable = coins
    .map((coin) => {
      const p = coin.pctile30d ?? coin.longPct;
      return p === null ? null : { coin, p, usedFallback: coin.pctile30d === null };
    })
    .filter((x): x is { coin: WhaleCoin; p: number; usedFallback: boolean } => x !== null);
  const maxGross = Math.max(1, ...usable.map((u) => u.coin.grossUsd ?? 0));
  const byGross = [...usable].sort((a, b) => (b.coin.grossUsd ?? 0) - (a.coin.grossUsd ?? 0));
  const labelled = new Set(byGross.slice(0, LABEL_COUNT).map((u) => u.coin.symbol));
  const extreme = [...usable].sort((a, b) => Math.abs(b.p - 50) - Math.abs(a.p - 50));
  const ping = new Set(extreme.slice(0, PING_COUNT).map((u) => u.coin.symbol));

  const out: Blip[] = [];
  for (const lean of ["long", "short"] as const) {
    const half = usable
      .filter((u) => (lean === "long" ? u.p >= 50 : u.p < 50))
      .sort((a, b) => a.coin.symbol.localeCompare(b.coin.symbol));
    const n = half.length;
    half.forEach((u, i) => {
      const theta = n === 1 ? Math.PI / 2 : MIN_ANGLE + ((MAX_ANGLE - MIN_ANGLE) * i) / Math.max(1, n - 1);
      const dist = Math.min(1, Math.abs(u.p - 50) / 50);
      const rr = R * (0.07 + 0.93 * dist);
      const x = C + rr * Math.cos(theta);
      const y = lean === "long" ? C - rr * Math.sin(theta) : C + rr * Math.sin(theta);
      const r = 3 + 10 * Math.sqrt((u.coin.grossUsd ?? 0) / maxGross);
      out.push({
        coin: u.coin,
        lean,
        p: u.p,
        usedFallback: u.usedFallback,
        x,
        y,
        r,
        labelled: labelled.has(u.coin.symbol),
        ping: ping.has(u.coin.symbol),
      });
    });
  }
  // Draw small blips last so they stay clickable on top of big ones.
  return out.sort((a, b) => b.r - a.r);
}

export function RadarChart({ coins, className, sample = false }: { coins: WhaleCoin[]; className?: string; sample?: boolean }) {
  const router = useRouter();
  const blips = useMemo(() => layout(coins), [coins]);
  const [hover, setHover] = useState<string | null>(null);
  const hovered = blips.find((b) => b.coin.symbol === hover) ?? null;
  const open = (symbol: string) => router.push(`/coin/${encodeURIComponent(symbol)}`);

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[780px]", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full select-none" role="group" aria-label="Whale positioning radar">
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={PALETTE.surface} stopOpacity={1} />
            <stop offset="100%" stopColor={PALETTE.page} stopOpacity={1} />
          </radialGradient>
          <linearGradient id="sweep-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={PALETTE.transfer} stopOpacity={0} />
            <stop offset="100%" stopColor={PALETTE.transfer} stopOpacity={0.22} />
          </linearGradient>
          <clipPath id="radar-clip">
            <circle cx={C} cy={C} r={R} />
          </clipPath>
        </defs>

        <circle cx={C} cy={C} r={R} fill="url(#radar-bg)" />
        {/* Hemisphere washes */}
        <path d={`M ${C - R} ${C} A ${R} ${R} 0 0 1 ${C + R} ${C} Z`} fill={PALETTE.long} fillOpacity={0.05} />
        <path d={`M ${C - R} ${C} A ${R} ${R} 0 0 0 ${C + R} ${C} Z`} fill={PALETTE.short} fillOpacity={0.05} />

        {rings.map((f) => (
          <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke={PALETTE.grid} strokeWidth={1} />
        ))}
        <line x1={C - R} y1={C} x2={C + R} y2={C} stroke={PALETTE.axis} strokeWidth={1} />
        <line x1={C} y1={C - R} x2={C} y2={C + R} stroke={PALETTE.grid} strokeWidth={1} />

        {/* Ring labels: percentile at each ring, top and bottom */}
        {rings.map((f) => (
          <g key={`lbl-${f}`} fontSize={9} fill={PALETTE.textMuted}>
            <text x={C + 3} y={C - R * f + 10}>
              {50 + 50 * f}
            </text>
            <text x={C + 3} y={C + R * f - 3}>
              {50 - 50 * f}
            </text>
          </g>
        ))}
        <text x={C - R + 6} y={C - 6} fontSize={10} fill={PALETTE.textMuted} letterSpacing={0.6}>
          LONG-LEANING
        </text>
        <text x={C - R + 6} y={C + 14} fontSize={10} fill={PALETTE.textMuted} letterSpacing={0.6}>
          SHORT-LEANING
        </text>

        {/* Sweep */}
        <g clipPath="url(#radar-clip)" aria-hidden>
          <g className="radar-sweep">
            <path d={`M ${C} ${C} L ${C + R} ${C} A ${R} ${R} 0 0 0 ${C + R * Math.cos(Math.PI / 7)} ${C - R * Math.sin(Math.PI / 7)} Z`} fill="url(#sweep-grad)" />
            <line x1={C} y1={C} x2={C + R} y2={C} stroke={PALETTE.transfer} strokeOpacity={0.55} strokeWidth={1.5} />
          </g>
        </g>

        {/* Blips */}
        {blips.map((b) => {
          const color = b.lean === "long" ? PALETTE.long : PALETTE.short;
          const active = hover === b.coin.symbol;
          const label = `${b.coin.symbol}: ${b.lean}-leaning, ${b.usedFallback ? "long share" : "30-day percentile"} ${b.p.toFixed(1)}, gross ${fmtUsd(b.coin.grossUsd)}`;
          return (
            <g
              key={b.coin.symbol}
              role="link"
              tabIndex={0}
              aria-label={label}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setHover(b.coin.symbol)}
              onMouseLeave={() => setHover((h) => (h === b.coin.symbol ? null : h))}
              onFocus={() => setHover(b.coin.symbol)}
              onBlur={() => setHover((h) => (h === b.coin.symbol ? null : h))}
              onClick={() => open(b.coin.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open(b.coin.symbol);
                }
              }}
            >
              {/* generous invisible hit target */}
              <circle cx={b.x} cy={b.y} r={Math.max(10, b.r + 4)} fill="transparent" />
              {b.ping && <circle cx={b.x} cy={b.y} r={b.r} fill="none" stroke={color} strokeWidth={1.5} className="radar-blip-ping" />}
              <circle
                cx={b.x}
                cy={b.y}
                r={active ? b.r + 2 : b.r}
                fill={color}
                fillOpacity={active ? 1 : 0.85}
                stroke={active ? PALETTE.text : PALETTE.surface}
                strokeWidth={2}
              />
              {(b.labelled || active) && (
                <text
                  x={b.x + b.r + 3}
                  y={b.y + 3.5}
                  fontSize={active ? 12 : 10}
                  fontWeight={active ? 600 : 500}
                  fill={active ? PALETTE.text : PALETTE.textMuted}
                  stroke={PALETTE.page}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {b.coin.symbol}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute z-10 w-52 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-xl"
          style={{
            left: `${Math.min(100, Math.max(0, (hovered.x / SIZE) * 100))}%`,
            top: `${(hovered.y / SIZE) * 100}%`,
            transform: `translate(${hovered.x > C ? "calc(-100% - 14px)" : "14px"}, -50%)`,
          }}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-mono text-sm font-semibold">{hovered.coin.symbol}</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <span className={cn("size-2 rounded-full", hovered.lean === "long" ? "bg-long" : "bg-short")} />
              {hovered.lean === "long" ? "Long-leaning" : "Short-leaning"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5">
            <dt className="text-muted-foreground">30D pctile</dt>
            <dd className="tabular text-right">{hovered.coin.pctile30d === null ? "n/a" : hovered.coin.pctile30d.toFixed(1)}</dd>
            <dt className="text-muted-foreground">Long share</dt>
            <dd className="tabular text-right">{fmtPct(hovered.coin.longPct)}</dd>
            <dt className="text-muted-foreground">Gross</dt>
            <dd className="tabular text-right">{fmtUsd(hovered.coin.grossUsd)}</dd>
            <dt className="text-muted-foreground">Net</dt>
            <dd className="tabular text-right">{fmtUsd(hovered.coin.netUsd, { sign: true })}</dd>
            <dt className="text-muted-foreground">Whales L/S</dt>
            <dd className="tabular text-right">
              {hovered.coin.nLong ?? "—"} / {hovered.coin.nShort ?? "—"}
            </dd>
          </dl>
          <p className="mt-1 text-[10px] text-muted-foreground">Click to open chart</p>
        </div>
      )}
      {sample && (
        <span className="absolute top-2 left-2 rounded border border-liq/40 bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-liq">
          Sample data
        </span>
      )}
    </div>
  );
}

export function RadarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-long" /> Long-leaning vs its 30-day range
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-short" /> Short-leaning vs its 30-day range
      </li>
      <li>Distance from centre = how extreme (rim = 30-day high/low)</li>
      <li>Size = gross whale notional</li>
    </ul>
  );
}
