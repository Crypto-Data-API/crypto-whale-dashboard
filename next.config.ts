import path from "node:path";
import type { NextConfig } from "next";

// Cache Components is intentionally left off: this is a client-driven live
// dashboard (polling + SSE) and every API call goes through dynamic route
// handlers, so there is nothing to prerender beyond the static app shell.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
