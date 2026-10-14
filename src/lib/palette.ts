/**
 * WhaleDesk colour tokens as plain strings, for inline styles and for
 * canvas/SVG libraries (lightweight-charts, Recharts) that cannot read CSS
 * variables. Keep in sync with the @theme block in src/app/globals.css.
 */
export const DECK = {
  bg: "#05060b",
  text: "#e8ecff",
  bright: "#f2f4ff",
  soft: "#a3a9cc",
  muted: "#8a90b4",
  dim: "#6d7399",
  dimmer: "#5d6390",
  long: "#00f5d4",
  longHover: "#7dfff0",
  longDeep: "#00a896",
  short: "#ff2d75",
  shortSoft: "#ff6b9d",
  shortDeep: "#b3104c",
  blue: "#4d7cff",
  blueSoft: "#7d9bff",
  violet: "#b18cff",
  amber: "#ffc53d",
  slate: "#3a3f63",
  logoBg: "#0b0d18",
} as const;

/** Semantic aliases used by the charts. */
export const PALETTE = {
  long: DECK.long,
  short: DECK.short,
  liq: DECK.amber,
  transfer: DECK.blue,
  position: DECK.violet,
  context: DECK.muted,
  surface: "#090b16",
  page: DECK.bg,
  grid: "rgba(120, 140, 255, 0.07)",
  gridVert: "rgba(120, 140, 255, 0.05)",
  axis: "rgba(120, 140, 255, 0.13)",
  text: DECK.text,
  textMuted: DECK.dim,
} as const;

/** `#rrggbb` + alpha (0..1) -> `rgba()` string. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Colour set for a long-leaning (true), short-leaning (false) or unknown (null) coin. */
export interface LeanTone {
  long: boolean | null;
  color: string;
  /** strong glow, rgba .45 */
  glow: string;
  /** faint glow for big cards, rgba .12 */
  glowSoft: string;
  /** card shadow, rgba .18 */
  shadow: string;
  /** card border, rgba .35 */
  border: string;
  /** pill / button fill, rgba .1 */
  tint: string;
  label: string;
}

const LONG_TONE: LeanTone = {
  long: true,
  color: DECK.long,
  glow: "rgba(0,245,212,.45)",
  glowSoft: "rgba(0,245,212,.12)",
  shadow: "rgba(0,245,212,.18)",
  border: "rgba(0,245,212,.35)",
  tint: "rgba(0,245,212,.1)",
  label: "LONG-LEANING",
};

const SHORT_TONE: LeanTone = {
  long: false,
  color: DECK.short,
  glow: "rgba(255,45,117,.45)",
  glowSoft: "rgba(255,45,117,.12)",
  shadow: "rgba(255,45,117,.18)",
  border: "rgba(255,45,117,.35)",
  tint: "rgba(255,45,117,.1)",
  label: "SHORT-LEANING",
};

const NEUTRAL_TONE: LeanTone = {
  long: null,
  color: DECK.blue,
  glow: "rgba(77,124,255,.45)",
  glowSoft: "rgba(77,124,255,.12)",
  shadow: "rgba(77,124,255,.18)",
  border: "rgba(120,140,255,.13)",
  tint: "rgba(77,124,255,.1)",
  label: "NO DATA",
};

export function leanTone(long: boolean | null): LeanTone {
  return long === null ? NEUTRAL_TONE : long ? LONG_TONE : SHORT_TONE;
}
