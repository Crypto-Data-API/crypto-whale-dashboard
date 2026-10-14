/**
 * Build-time deployment flags. Both are NEXT_PUBLIC_ variables, so Next
 * inlines them into server and browser bundles at build time.
 *
 * NEXT_PUBLIC_STATIC_SAMPLE=1  static export (GitHub Pages): no server, no
 *                              API proxy, every request is answered from the
 *                              bundled snapshots in public/sample.
 * NEXT_PUBLIC_BASE_PATH        sub-path the site is served from, e.g.
 *                              "/crypto-whale-dashboard" on GitHub Pages.
 *                              Empty for local dev and root deployments.
 */
export const STATIC_SAMPLE = process.env.NEXT_PUBLIC_STATIC_SAMPLE === "1";

/** "" or "/some/path" (leading slash, no trailing slash). */
export const BASE_PATH = normaliseBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

export function normaliseBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Prefixes an absolute app path with the base path. Use it for fetch(),
 * EventSource and cookie paths; next/link and the router add the base path
 * on their own.
 */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
