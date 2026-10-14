import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Stat tile: label (sentence case) · value · optional sub-line.
 * Values use text ink; an optional colored marker carries polarity next to it.
 */
export function StatTile({
  label,
  value,
  sub,
  marker,
  loading = false,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  marker?: "long" | "short" | "liq" | null;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-xl bg-card px-3 py-2.5 ring-1 ring-foreground/10", className)}>
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <span className="flex items-center gap-1.5 truncate text-lg leading-tight font-semibold">
          {marker && (
            <span
              aria-hidden
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                marker === "long" && "bg-long",
                marker === "short" && "bg-short",
                marker === "liq" && "bg-liq",
              )}
            />
          )}
          {value}
        </span>
      )}
      {sub && !loading && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
