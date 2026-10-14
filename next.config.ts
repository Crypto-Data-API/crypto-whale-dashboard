import path from "node:path";
import type { NextConfig } from "next";

// Cache Components is intentionally left off: this is a client-driven live
// dashboard (polling + SSE) and every API call goes through dynamic route
// handlers, so there is nothing to prerender beyond the static app shell.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
