import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, resolveSample, type Json } from "./sample-core";

/**
 * Sample-data fallback for the REST proxy.
 *
 * When no API key is available at all (no key in Settings, no CDA_API_KEY on
 * the server), or Demo mode asks for it, the proxy answers a fixed set of GET
 * endpoints from the JSON snapshots in public/sample/. As soon as a key exists
 * the proxy talks to CryptoDataApi instead, so sample data is replaced
 * automatically. Path mapping and time shifting live in ./sample-core, which
 * the static GitHub Pages build also uses in the browser.
 */

const SAMPLE_DIR = path.join(process.cwd(), "public", "sample");

const cache = new Map<string, Promise<Json | null>>();

function load(name: string): Promise<Json | null> {
  let p = cache.get(name);
  if (!p) {
    p = readFile(path.join(SAMPLE_DIR, `${name}.json`), "utf8")
      .then((t) => JSON.parse(t) as Json)
      .catch(() => null);
    cache.set(name, p);
  }
  return p;
}

/** True when sample snapshots exist on this deployment. */
export async function hasSampleData(): Promise<boolean> {
  return (await loadManifest(load)) !== null;
}

/**
 * Answers a GET request from the sample snapshots, or returns null when no
 * snapshots exist (the caller then responds as it would without a key).
 */
export async function sampleResponse(rawPath: string, sp: URLSearchParams): Promise<Response | null> {
  const reply = await resolveSample(load, rawPath, sp);
  if (!reply) return null;
  return new Response(JSON.stringify(reply.body), {
    status: reply.status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-cda-key-source": "sample" },
  });
}
