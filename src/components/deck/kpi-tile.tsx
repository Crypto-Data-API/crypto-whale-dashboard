import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DECK } from "@/lib/palette";

/**
 * KPI tile. "side" = compact radar tile with a 2px left colour bar and an
 * inline sub-line; "top" = large accounts tile with a 2px top colour bar.
 * Blue tiles are informational: their bar is dimmed and the value has no glow.
 */
export function KpiTile({
  label,
  value,
  sub,
  color = DECK.blue,
  valColor = DECK.bright,
  variant = "side",
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  color?: string;
  valColor?: string;
  variant?: "side" | "top";
  loading?: boolean;
  className?: string;
}) {
  const informational = color === DECK.blue;
  const glow = informational ? "transparent" : `${color}66`;
  const barOpacity = informational ? 0.5 : 1;

  if (variant === "top") {
    return (
      <div
        className={cn(
          "relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[14px] border border-iris/13 bg-[linear-gradient(180deg,rgba(18,21,40,.85),rgba(10,12,24,.85))] px-[18px] py-4",
          className,
        )}
      >
        <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color, boxShadow: `0 0 14px ${color}`, opacity: barOpacity }} />
        <div className="truncate font-mono text-[10.5px] tracking-[.12em] text-ink-muted uppercase">{label}</div>
        {loading ? (
          <div className="h-7 w-24 animate-pulse rounded-md bg-iris/10" />
        ) : (
          <div className="truncate font-display text-[28px] leading-none font-bold" style={{ color: valColor, textShadow: `0 0 18px ${glow}` }}>
            {value}
          </div>
        )}
        <div className="truncate font-mono text-[12px] text-ink-muted">{loading ? " " : (sub ?? " ")}</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-[11px] border border-iris/13 bg-[linear-gradient(180deg,rgba(18,21,40,.85),rgba(10,12,24,.85))] px-3 py-2.5",
        className,
      )}
    >
      <div className="absolute inset-y-0 left-0 w-0.5" style={{ background: color, boxShadow: `0 0 10px ${color}`, opacity: barOpacity }} />
      <div className="truncate font-mono text-[9.5px] tracking-[.1em] text-ink-muted uppercase">{label}</div>
      {loading ? (
        <div className="h-[21px] w-20 animate-pulse rounded-md bg-iris/10" />
      ) : (
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-display text-[19px] leading-[1.1] font-bold whitespace-nowrap" style={{ color: valColor, textShadow: `0 0 14px ${glow}` }}>
            {value}
          </span>
          {sub !== undefined && <span className="truncate font-mono text-[10.5px] whitespace-nowrap text-ink-muted">{sub}</span>}
        </div>
      )}
    </div>
  );
}
