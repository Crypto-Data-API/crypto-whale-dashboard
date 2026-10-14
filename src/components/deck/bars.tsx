import { cn } from "@/lib/utils";
import { DECK } from "@/lib/palette";

function clamp(v: number) {
  return Math.max(0, Math.min(100, v));
}

/** Long / short split. "glow" = big gradient bar for cards; "flat" = thin table bar. */
export function LsBar({ longPct, variant = "flat", className }: { longPct: number; variant?: "glow" | "flat"; className?: string }) {
  const l = clamp(longPct);
  if (variant === "glow") {
    return (
      <div className={cn("flex h-2.5 gap-0.5 overflow-hidden rounded-[6px] bg-iris/8", className)} role="img" aria-label={`Long ${l.toFixed(1)}%, short ${(100 - l).toFixed(1)}%`}>
        <div className="bg-[linear-gradient(90deg,#00a896,#00f5d4)] shadow-[0_0_12px_rgba(0,245,212,.6)] transition-[width] duration-600" style={{ width: `${l}%` }} />
        <div className="flex-1 bg-[linear-gradient(90deg,#ff2d75,#b3104c)] shadow-[0_0_12px_rgba(255,45,117,.6)]" />
      </div>
    );
  }
  return (
    <div className={cn("flex h-[7px] flex-1 gap-0.5 overflow-hidden rounded-[4px]", className)} role="img" aria-label={`Long ${l.toFixed(1)}%, short ${(100 - l).toFixed(1)}%`}>
      <div className="bg-long shadow-[0_0_8px_rgba(0,245,212,.55)]" style={{ width: `${l}%` }} />
      <div className="flex-1 bg-short shadow-[0_0_8px_rgba(255,45,117,.55)]" />
    </div>
  );
}

/** 80px percentile track with a centre tick and a coloured knob (tables). */
export function PctileTrack({ value }: { value: number }) {
  const v = clamp(value);
  const color = v >= 50 ? DECK.long : DECK.short;
  return (
    <div className="relative h-1 w-20 shrink-0 rounded-[4px] bg-iris/15" aria-hidden>
      <div className="absolute -top-[3px] left-1/2 h-2.5 w-px bg-[rgba(138,144,180,.5)]" />
      <div
        className="absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${v}%`, background: color, boxShadow: `0 0 8px ${color}` }}
      />
    </div>
  );
}

/** Wide percentile track: pink → slate → cyan gradient with a white knob. */
export function PctileGauge({ value, color }: { value: number; color: string }) {
  const v = clamp(value);
  return (
    <div className="relative h-1.5 rounded-[6px] bg-[linear-gradient(90deg,#ff2d75,#3a3f63_50%,#00f5d4)]" aria-hidden>
      <div
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-[left] duration-600"
        style={{ left: `${v}%`, boxShadow: `0 0 0 3px ${color}, 0 0 16px ${color}` }}
      />
    </div>
  );
}
