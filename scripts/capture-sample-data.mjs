#!/usr/bin/env node
/**
 * Captures a snapshot of real CryptoDataApi responses into public/sample/.
 * The dashboard serves these when no API key is configured, so first-time
 * visitors see a populated UI. Once a key is added, live data replaces them.
 * The static GitHub Pages build fetches the same files from /sample/*.json.
 *
 * Usage:  node scripts/capture-sample-data.mjs            (reads CDA_API_KEY from .env)
 *         CDA_API_KEY=... node scripts/capture-sample-data.mjs
 *
 * Uses roughly 45 requests. The key is never printed.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "sample");
const BASE = process.env.CDA_API_BASE || "https://cryptodataapi.com/api/v1";
const COINS = ["DOGE", "BTC", "ETH", "SOL"];
const INTERVALS = { "5m": 1000, "15m": 1000, "1h": 1000, "4h": 500, "1d": 365 };
const TRADE_FLOW_DAYS = 3;

async function loadKey() {
  if (process.env.CDA_API_KEY) return process.env.CDA_API_KEY.trim();
  try {
    const env = await readFile(path.join(ROOT, ".env"), "utf8");
    const m = env.match(/^\s*CDA_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("CDA_API_KEY not found (set it in .env or the environment)");
}

let requests = 0;
async function get(key, p, params = {}) {
  const url = new URL(`${BASE}/${p}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  requests++;
  const res = await fetch(url, { headers: { "X-API-Key": key, Accept: "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${p} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function save(name, data) {
  const file = path.join(OUT, `${name}.json`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
  console.log(`  wrote ${path.relative(ROOT, file)} (${(Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(0)} KB)`);
}

async function tryStep(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.warn(`  skipped ${label}: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  const key = await loadKey();
  const capturedAt = Date.now();
  console.log("Capturing sample data…");

  await tryStep("quant/whales", async () => save("quant-whales", await get(key, "quant/whales")));
  await tryStep("quant/whales/history", async () => save("quant-whales-history", await get(key, "quant/whales/history", { days: 180 })));
  await tryStep("daily/hl-traders", async () => save("hl-traders", await get(key, "daily/hl-traders")));
  await tryStep("hyperliquid/trader-profiles", async () => save("trader-profiles", await get(key, "hyperliquid/trader-profiles")));
  await tryStep("hyperliquid/open-interest", async () => save("hl-open-interest", await get(key, "hyperliquid/open-interest")));
  await tryStep("market-health", async () => save("market-health", await get(key, "market-health")));
  await tryStep("stream/recent", async () => save("stream-recent", await get(key, "stream/recent", { limit: 500 })));
  await tryStep("spike-alerts", async () => save("spike-alerts", await get(key, "on-chain/exchange-flows/spike-alerts", { min_amount: 1_000_000, limit: 500 })));
  await tryStep("coins/top", async () => save("coins-top", await get(key, "coins/top", { limit: 100 })));

  for (const coin of COINS) {
    console.log(`\n${coin}`);
    for (const [interval, limit] of Object.entries(INTERVALS)) {
      await tryStep(`candles ${interval}`, async () =>
        save(`candles/${coin}-${interval}`, await get(key, "hyperliquid/candles", { coin, interval, limit })),
      );
    }
    await tryStep("trade flow (3d)", async () => {
      const start = new Date(capturedAt - TRADE_FLOW_DAYS * 86_400_000).toISOString();
      const rows = [];
      let cursor;
      for (let page = 0; page < 10; page++) {
        const res = await get(key, "backtesting/hl-trade-flow", { coin, start, limit: 5000, cursor });
        rows.push(...(res.data ?? []));
        if (!res.has_more || !res.next_cursor) break;
        cursor = res.next_cursor;
      }
      // Re-shaped into the /hyperliquid/trade-flow envelope the dashboard parses.
      await save(`trade-flow/${coin}`, {
        coin,
        minutes: TRADE_FLOW_DAYS * 1440,
        bucket: "1m",
        window_start: rows[0]?.time ?? null,
        window_end: rows[rows.length - 1]?.time ?? null,
        stream: { connected: true, coverage_pct: 100 },
        data: rows.map((r) => ({ ...r, cvd_usd: null })),
        count: rows.length,
        source: "backtesting/hl-trade-flow",
      });
    });
    await tryStep("summary", async () => save(`summary/${coin}`, await get(key, "hyperliquid/summary", { coin })));
    await tryStep("quant coin", async () => save(`quant/${coin}`, await get(key, `quant/coins/${coin}`)));
    await tryStep("news", async () => save(`news/${coin}`, await get(key, `news/coin/${coin}`, { hours: 72 })));
    await tryStep("recent events", async () =>
      save(`events/${coin}`, await get(key, "stream/recent", { limit: 500, types: "whale_position,liquidation,whale_transfer", symbols: coin })),
    );
  }

  await save("manifest", { capturedAt, capturedAtIso: new Date(capturedAt).toISOString(), coins: COINS, intervals: Object.keys(INTERVALS), tradeFlowDays: TRADE_FLOW_DAYS });
  console.log(`\nDone: ${requests} requests.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
