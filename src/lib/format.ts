/**
 * Number / time formatting helpers shared across the dashboard.
 * All helpers accept null/undefined/NaN and return an em dash placeholder.
 */

const DASH = "—";

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Compact USD: $1.2B, $340M, $85K, $950, -$1.2M. */
export function fmtUsd(value: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const { digits, sign = false } = opts;
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : sign && value > 0 ? "+" : "";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = abs / size;
      const d = digits ?? (scaled >= 100 ? 0 : 1);
      return `${prefix}$${trimZeros(scaled.toFixed(d))}${suffix}`;
    }
  }
  const d = digits ?? (abs >= 100 ? 0 : abs >= 1 ? 0 : 2);
  return `${prefix}$${trimZeros(abs.toFixed(d))}`;
}

/** Compact plain number: 1.2M, 340K, 950. */
export function fmtCompact(value: number | null | undefined, digits = 1): string {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  const prefix = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${prefix}${trimZeros((abs / 1e9).toFixed(digits))}B`;
  if (abs >= 1e6) return `${prefix}${trimZeros((abs / 1e6).toFixed(digits))}M`;
  if (abs >= 1e3) return `${prefix}${trimZeros((abs / 1e3).toFixed(digits))}K`;
  return `${prefix}${trimZeros(abs.toFixed(abs >= 100 ? 0 : abs >= 1 ? 2 : 4))}`;
}

/** Integer with thousands separators. */
export function fmtInt(value: number | null | undefined): string {
  if (!isNum(value)) return DASH;
  return Math.round(value).toLocaleString("en-US");
}

/** Percent where the input is already in percent units (45.2 -> "45.2%"). */
export function fmtPct(value: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  const { digits = 1, sign = false } = opts;
  const prefix = sign && value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(digits)}%`;
}

/** Percent where the input is a fraction (0.452 -> "45.2%"). */
export function fmtFrac(value: number | null | undefined, opts: { digits?: number; sign?: boolean } = {}): string {
  if (!isNum(value)) return DASH;
  return fmtPct(value * 100, opts);
}

/** Price with precision adapted to magnitude. */
export function fmtPrice(value: number | null | undefined): string {
  if (!isNum(value)) return DASH;
  const abs = Math.abs(value);
  const digits = priceDigits(abs);
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function priceDigits(abs: number): number {
  if (abs >= 10000) return 0;
  if (abs >= 100) return 2;
  if (abs >= 1) return 3;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 7;
  return 9;
}

/** Relative time from a ms timestamp against `now` (ms): "12s ago", "5m ago", "3h ago", "2d ago". */
export function relTime(ts: number | null | undefined, now: number): string {
  if (!isNum(ts) || !isNum(now) || now <= 0) return DASH;
  const diff = Math.max(0, now - ts);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** HH:MM:SS in local time. */
export function fmtClock(ts: number | null | undefined): string {
  if (!isNum(ts)) return DASH;
  const d = new Date(ts);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

/** "14 Oct 05:00" in local time. */
export function fmtDateTime(ts: number | null | undefined): string {
  if (!isNum(ts)) return DASH;
  const d = new Date(ts);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Shorten a 0x address: 0x1856…808a */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return DASH;
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
