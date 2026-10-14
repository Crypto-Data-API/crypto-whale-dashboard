/**
 * Hex mirrors of the dark-theme CSS tokens for canvas/SVG libraries
 * (lightweight-charts, Recharts) that cannot read CSS variables.
 * Long/short/liquidation were validated together for CVD separation
 * and >= 3:1 contrast on the card surface (#141821).
 */
export const PALETTE = {
  long: "#19a89a",
  short: "#e5674e",
  liq: "#c2a800",
  transfer: "#3987e5",
  position: "#d55181",
  context: "#8b93a4",
  surface: "#141821",
  page: "#0d1016",
  grid: "#232a36",
  axis: "#2e3644",
  text: "#e8ebf0",
  textMuted: "#949cad",
} as const;

/** `#rrggbb` + alpha (0..1) -> `rgba()` string. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
