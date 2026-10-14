import path from "node:path";
import type { NextConfig } from "next";

/**
 * NEXT_PUBLIC_STATIC_SAMPLE=1 builds a static export (GitHub Pages): no
 * server, no API proxy, sample data only. Use `npm run build:static`, which
 * moves the route handlers aside for the build (they cannot be exported).
 * NEXT_PUBLIC_BASE_PATH serves the app from a sub-path such as
 * "/crypto-whale-dashboard" (GitHub project pages). Both default to off.
 */
const STATIC_SAMPLE = process.env.NEXT_PUBLIC_STATIC_SAMPLE === "1";
const BASE_PATH = (() => {
  const raw = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
  return raw && !raw.startsWith("/") ? `/${raw}` : raw;
})();

// Cache Components is intentionally left off: this is a client-driven live
// dashboard (polling + SSE) and every API call goes through dynamic route
// handlers, so there is nothing to prerender beyond the static app shell.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(STATIC_SAMPLE
    ? {
        output: "export",
        // /coin/BTC -> /coin/BTC/index.html, which static hosts serve without rewrites.
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        // The proxy reads the sample snapshots with fs at runtime; make sure
        // serverless bundles (Vercel) include them.
        outputFileTracingIncludes: {
          "/api/cda/**": ["./public/sample/**/*"],
        },
      }),
  ...(BASE_PATH ? { basePath: BASE_PATH, assetPrefix: BASE_PATH } : {}),
  // Next 16 blocks dev resources (HMR, fonts, stack frames) for any origin
  // other than localhost, which leaves the client stuck before it mounts.
  // Allow the loopback aliases and LAN hosts people typically open in dev.
  allowedDevOrigins: ["127.0.0.1", "[::1]", "*.local", "100.73.123.29"],
  turbopack: {
    // A package-lock.json in a parent folder would otherwise be picked as the root.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
