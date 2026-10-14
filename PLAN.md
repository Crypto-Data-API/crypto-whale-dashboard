# Crypto Whale Dashboard – Development Plan

Powered by [CryptoDataApi.com](https://cryptodataapi.com). All data comes from the CDA REST API
(`https://cryptodataapi.com/api/v1/...`, auth via `X-API-Key` header) and its SSE event stream.

## 1. Goals

1. A fast, good-looking dashboard that makes whale activity obvious at a glance.
2. Click any coin → price chart with big whale buys/sells plotted on the candles.
3. Live whale alerts feed (transfers, position entries/exits, liquidations).
4. Bring-your-own CDA key (Free / Pro / Pro Plus), with graceful degradation per tier.
5. Showcase the rest of the API where it adds context: regimes, market health, liquidity, news, etc.

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Route handlers give us a server proxy for the API key and SSE |
| Styling | Tailwind CSS + shadcn/ui | Fast dark-mode dashboard UI |
| Data fetching | TanStack Query | Polling, caching, stale-while-revalidate per endpoint |
| State | Zustand (persisted) | Settings, API key, watchlist, alert filters |
| Charts | TradingView `lightweight-charts` | Candles + markers for whale trades, performant |
| Small charts | Recharts | Sparklines, bars, long/short splits |
| Tables | TanStack Table | Sortable/filterable coin and whale tables |
| Deploy | Vercel | Edge-friendly, SSE via Node runtime route |

## 3. API key handling & proxy

- User pastes their key in **Settings**. Stored in `localStorage` (never logged server-side).
- All browser requests go to our own `/api/cda/[...path]` route handler, which forwards to
  `https://cryptodataapi.com/api/v1/<path>` and injects `X-API-Key` from a request header the client sets.
  This avoids CORS issues and lets us surface `X-RateLimit-*` / `Retry-After` headers to the UI.
- SSE: `EventSource` cannot set headers, so `/api/cda/stream` is a Node route that opens the
  upstream stream with the key and pipes it through, preserving `id:` lines so `Last-Event-ID` reconnects work.
- On first save, call `GET /auth/keys/me` to detect tier (`free` / `pro` / `pro_plus`) and limits.
  Store the tier and gate features accordingly. Show the daily/minute budget in the header.
- No key → demo mode: use key-less endpoints (`/stream/delayed`, `/exchanges`, `/health`) and
  prompt to add a key. Optional: a server-side `CDA_DEMO_KEY` env var for a hosted public demo.
- Rate limiting: central fetch wrapper with per-endpoint poll intervals, request de-dupe,
  exponential backoff on 429 honouring `Retry-After`, and a 503 "warming" handler.

## 4. Feature map → endpoints

### 4.1 Whale Radar (home)
Mirror of https://cryptodataapi.com/crypto-whales, but the full universe with a Pro key.
- `GET /quant/whales` (Pro, 5-min refresh) → summary (accounts, by_class, by_tag_usd, long_pct,
  long_short_ratio, net_bias) and `top_coins` (gross/long/short/net USD, directional_net_usd,
  long_pct_pctile_30d, n_long, n_short, dominant_side).
- Views: radar (polar blips: hemisphere = long vs short lean, radius = 30-day percentile), and table
  (Coin, Mark, Gross, L/S, Net, Net ex-MM, 30D percentile, #whales) with sort/filter/search.
- Header stat tiles: market cap, HL OI, whale long %, net bias, 24h liquidations, market health.
- `GET /quant/whales/history?days=180` (Pro Plus) → daily long/short notional chart (risk-on/off cycle).
- Free tier: show top 3 coins + upsell banner (matches the public preview).

### 4.2 Whale Alerts (live feed)
- Backfill with `GET /stream/recent?limit=500&types=...&min_usd=...`, then open
  `GET /stream?since_id=<last_id>` (Pro). Free → poll `/stream/delayed` (30-min delayed).
- Event types: `whale_transfer` (exchange, chain, direction, amount, usd), `whale_position`
  (action entry/exit/increase/decrease, side, size, usd, address, change_pct), `liquidation`
  (side, usd, px, sz), `oi_delta`, `price_move`, `funding`.
- UI: virtualised feed with type/side colour coding, filters (types, symbols, min USD slider),
  pause/resume, sound + browser notification toggles, `lagged` reconnect handling.
- Supplement with `GET /on-chain/exchange-flows/spike-alerts` (large CEX wallet transfers, ~10h window)
  and `GET /market-intelligence/squeeze-alerts` (liquidation-flow tripwire).
- Persist last N events in IndexedDB so the feed is populated instantly on reload.

### 4.3 Coin page (click a coin)
Route: `/coin/[symbol]`.
- Candles: `GET /hyperliquid/candles?coin=BTC&interval=1h&limit=1000` (any key, up to 15k bars
  with start/end). Fallback / spot: `GET /market-data/klines?symbol=BTCUSDT&interval=1h`.
- **Whale buys/sells as markers on the chart**, sourced from:
  1. `whale_position` events for the symbol from the stream buffer (entry/increase = buy arrow,
     exit/decrease = sell arrow, sized by USD).
  2. `GET /hyperliquid/wallet-signals?minutes=1440` (entry/exit/size-change signals for tracked wallets).
  3. `GET /hyperliquid/wallet-trades/{address}?days=30` for wallets on the user's watchlist.
  4. `GET /hyperliquid/trade-flow?coin=X&minutes=1440` (Pro) → `max_fill_usd`, `large_fill_share`,
     `cvd_usd` → highlight minutes with large taker fills; CVD sub-pane.
  5. Liquidations: `GET /backtesting/hl-liquidations?coin=X&start=...` (Pro) for the per-fill liquidation tape.
  6. `GET /on-chain/exchange-flows/{symbol}` + spike alerts → inflow/outflow markers (CEX whales).
- Side panel: coin whale summary (from `/quant/whales` top_coins), funding/OI
  (`/hyperliquid/summary`, `/derivatives/summary`), L2 book depth (`/hyperliquid/l2-book`,
  `/liquidity/depth/{coin}`), quant probabilities (`/quant/coins/{symbol}`), GEX levels (`/quant/gex`),
  liquidation ladder (`/quant/positioning/ladder`, Pro Plus), news (`/news/coin/{symbol}`),
  regimes (`/volatility/regime/{symbol}`, `/indicators/technical/{symbol}`, `/indicators/signum-rgg/{symbol}`).
- Marker legend + toggles per source; hover tooltip with USD, side, address (link to trader profile).

### 4.4 Whale Traders (Hyperliquid wallets)
- `GET /hyperliquid/top-traders` leaderboard; `GET /hyperliquid/wallets/search` with score / win-rate /
  profit-factor filters; `GET /hyperliquid/copy-signals` (Pro).
- `/trader/[address]`: `trader-profile/{address}`, `wallet-positions`, `wallet-trades/{address}`
  with trades plotted on that coin's chart.
- Watchlist: `GET/POST/DELETE /hyperliquid/watchlist` (Pro) + `/watchlist/auto`.
- Webhooks: `POST /webhooks` to push ENTRY/EXIT/INCREASE/DECREASE for watched addresses to a user URL.

### 4.5 Market Overview
- `GET /market-health` (dual score, 11 components), `/market-health/history?days=90`.
- `GET /sentiment/fear-greed`, `/sentiment/stablecoins`, `/sentiment/macro`.
- `GET /regimes` + `/quant/market` (regime + direction/vol/liq probabilities).
- Regime scores row: `/volatility/regime/score`, `/liquidity/regime/score`, `/meme/regime/score`,
  `/event/regime/score`, `/security/regime/score`, `/policy/regime/score`, `/on-chain/score`.
- Derivatives: `/derivatives/summary`, `/market-intelligence/liquidations/by-exchange`,
  `/market-intelligence/etf/btc/flows`, `/market-intelligence/coinbase-premium`.

### 4.6 Scanners (exciting extras)
- Volume spikes: `/volume/scanner`. Trend radar: `/indicators/signum-rgg`, `/indicators/heatmap`.
- OI divergence: `/liquidity/oi-divergence`. Token unlocks: `/supply/unlocks` (whale sell pressure).
- News pulse: `/news/pulse`, `/news/market-moving`. DEX trending / rug check: `/dex/trending`, `/dex/security/...`.
- Backtest "follow vs fade the whales": `/backtesting/snapshots?data_type=whale_activity` +
  `/backtesting/klines` (Pro Plus) → simple PnL curve.

### 4.7 Settings
- API key (masked, test button → `/auth/keys/me`), tier badge, usage meter, rotate key link.
- Alert thresholds (min USD per event type), symbols filter, sound/notifications.
- Refresh intervals, default chart interval, theme, currency formatting.
- Export/import settings JSON. Webhook manager.

## 5. Project structure

```
src/
  app/
    (dashboard)/page.tsx          # Whale radar
    alerts/page.tsx
    coin/[symbol]/page.tsx
    traders/page.tsx, trader/[address]/page.tsx
    market/page.tsx, scanners/page.tsx, settings/page.tsx
    api/cda/[...path]/route.ts    # REST proxy
    api/cda/stream/route.ts       # SSE proxy
  lib/cda/
    client.ts                     # fetch wrapper, retries, rate-limit headers
    endpoints.ts                  # typed functions per endpoint
    types.ts                      # response types
    stream.ts                     # EventSource manager w/ since_id + backfill
  stores/                         # settings, alerts, watchlist
  components/                     # radar, charts, feed, tables, stat tiles, layout
  hooks/                          # useWhales, useCandles, useStream, useTier ...
```

## 6. Milestones

| # | Milestone | Scope |
|---|---|---|
| 0 | Scaffold | Next.js + Tailwind + shadcn, layout shell, settings store, API proxy, key validation, tier gating |
| 1 | Whale Radar | `/quant/whales` table + radar + stat tiles; free-tier preview mode |
| 2 | Whale Alerts | `/stream/recent` backfill + SSE live feed + filters + delayed fallback |
| 3 | Coin page | Candles via lightweight-charts; whale position markers from stream; trade-flow + CVD; liquidations |
| 4 | Coin side panel | Funding/OI, depth, quant probs, GEX, news, regimes |
| 5 | Traders | Leaderboard, wallet search, trader profile, watchlist, webhooks |
| 6 | Market + Scanners | Market health, regimes, scanners, unlocks, news |
| 7 | Polish | Notifications, PWA, keyboard nav, mobile layout, demo mode, docs, deploy |

## 7. Open questions / risks

- CORS: unknown whether the API allows browser origins; the proxy sidesteps this either way.
- `/on-chain/whales` is currently disabled (503) – skip until it ships.
- Rate budget: Pro = 10k/day, 30/min. Poll intervals must be tuned (whales 5 min, candles 1 min,
  summaries 1–5 min). The stream is the cheap way to get live data.
- Exact response shapes for a few endpoints are only partially documented; capture real
  responses with a PRO key during milestone 0 and generate types from them.
