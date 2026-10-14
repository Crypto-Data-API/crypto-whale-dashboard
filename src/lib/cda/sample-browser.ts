"use client";

import { withBasePath } from "@/lib/deploy";
import { notInSample, resolveSample, type Json, type SampleReply } from "./sample-core";

/**
 * Browser-side sample loader for the static build (NEXT_PUBLIC_STATIC_SAMPLE=1).
 * There is no proxy on GitHub Pages, so the snapshots are fetched as plain
 * files from `${basePath}/sample/<name>.json` and resolved with the same
 * mapping the server uses.
 */

const cache = new Map<string, Promise<Json | null>>();

function load(name: string): Promise<Json | null> {
  let p = cache.get(name);
  if (!p) {
    p = fetch(withBasePath(`/sample/${name}.json`)).then(async (res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Sample file ${name} failed (HTTP ${res.status})`);
      return (await res.json()) as Json;
    });
    cache.set(name, p);
    // Drop failed loads so a retry can fetch again.
    p.catch(() => cache.delete(name));
  }
  return p;
}

/**
 * Resolves an API path (no /api/v1 prefix, decoded segments) from the bundled
 * snapshot. Rejects only when a sample file cannot be downloaded.
 */
export async function sampleFetch(rawPath: string, sp: URLSearchParams): Promise<SampleReply> {
  return (await resolveSample(load, rawPath, sp)) ?? notInSample(rawPath);
}
