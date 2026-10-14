# Crypto Whale Dashboard

A real-time dashboard for tracking crypto whale activity, powered by [CryptoDataApi.com](https://cryptodataapi.com).

## What it does

- **Whale Radar** – see which coins Hyperliquid whales are leaning long or short, sized by notional and ranked against their 30-day norm.
- **Whale Exposure** – every coin's whale gross, long/short split, net, net ex-MM and 30-day percentile in one sortable table.
- **Whale Accounts** – tracked Hyperliquid whale wallets with their trading style, PnL and open positions.
- **Whale Alerts** – a live feed of whale position changes, on-chain exchange transfers, liquidations, OI and price moves, with sound and browser notifications.
- **Coin charts** – click any coin to open its price chart with whale buys/sells, liquidations and exchange flows plotted on the candles, plus a CVD pane.
- **Coin context** – whale positioning, funding and open interest, regime-model probabilities and news next to the chart.
- **Settings** – bring your own CryptoDataApi key (Free, Pro or Pro Plus) and tune thresholds, refresh rates and alerts.

Traders, Market and Scanners pages are stubs that list the endpoints they will use (see [PLAN.md](PLAN.md), milestones 5–6).

## Quick start

Requirements: Node.js 20.9+ (22.13+ recommended) and npm.

```bash
npm install
npm run dev
```

Open http://localhost:3000. If `.env` has `CDA_API_KEY`, everything loads through that server key and the sidebar shows "Using server key".
Otherwise go to **Settings**, paste your CryptoDataApi key and press **Test & Save**.
The key is checked against `GET /auth/keys/me`, and the tier badge, rate-limit meter and features update immediately. A key saved in Settings always takes priority over the server key.

Production build:

```bash
npm run build
npm start
```

Other scripts: `npm run lint`.

### Server-side key

Copy `.env.example` to `.env` and set `CDA_API_KEY` to use a server-side key whenever the browser has not supplied its own.

```bash
CDA_API_KEY=cdk_live_...
```

- The server key never reaches the browser. `GET /api/cda/_status` only reports `{ "hasServerKey": true|false }`.
- It is used for read-only (GET) requests only. Write requests without the visitor's own key get a 401 `user_key_required`, so a deployment cannot change the key owner's webhooks or watchlists.
- On a public deployment every visitor without their own key spends this key's rate limit.
- The app reads `CDA_API_KEY` (legacy alias `CDA_DEMO_KEY`) and optionally `CDA_API_BASE`. Other variables in `.env` are ignored.

### Sample data (no key at all)

With no key in Settings and no server key, the proxy answers from JSON snapshots in `src/data/sample/` so the UI is never empty: whale positioning, the wallet leaderboard with positions, recent alerts, exchange-flow spikes, and full coin pages for DOGE, BTC, ETH and SOL (candles on every interval plus three days of 1-minute trade flow for the big buy / sell dots). Timestamps are shifted so the snapshot always ends "now". The sidebar shows a **SAMPLE** badge, and the moment a key is saved the proxy switches to live data. **Demo mode** in Settings forces the snapshot even when a server key exists.

Refresh the snapshot with your own key (about 50 requests):

```bash
npm run sample:capture
```

## What each tier unlocks

| Feature | No key | Free | Pro | Pro Plus |
|---|---|---|---|---|
| Alerts feed | 30-min delayed (`/stream/delayed`) | 30-min delayed | Live SSE | Live SSE |
| Coin chart candles, funding/OI, news | – | ✓ | ✓ | ✓ |
| Whale Radar (`/quant/whales`) | sample data | preview / upsell | ✓ | ✓ |
| CVD pane (`/hyperliquid/trade-flow`) | – | – | ✓ | ✓ |
| Quant outlook (`/quant/coins/{symbol}`) | – | – | ✓ | ✓ |
| 180-day whale history | – | – | – | ✓ |

"No key" means neither a Settings key nor a server key. Cards show a "Requires Pro" or "Add your API key" state instead of an error when the tier does not cover an endpoint.

## How it works

```
Browser ── x-cda-key header ──▶ /api/cda/[...path] ──X-API-Key──▶ cryptodataapi.com/api/v1/...
Browser ── EventSource + cookie ─▶ /api/cda/stream ───X-API-Key──▶ cryptodataapi.com/api/v1/stream
                       (no browser key) ──▶ falls back to CDA_API_KEY on the server
```

- **Key handling.** A Settings key lives in `localStorage` (a persisted Zustand store) and is sent only to this app's own route handlers, which forward it upstream. Without one, the handlers use `CDA_API_KEY`. Route handlers never log either key. `EventSource` cannot set headers, so the stream route reads a browser key from a `cda_key` cookie scoped to `/api/cda/stream` (a `key` query param also works) before falling back to the server key.
- **REST proxy** (`src/app/api/cda/[...path]/route.ts`) passes through status codes, JSON bodies, `X-RateLimit-*` and `Retry-After`.
- **SSE proxy** (`src/app/api/cda/stream/route.ts`) pipes frames through with no extra buffering, turns `: ping` comments into `event: ping` for the client watchdog, and reports upstream HTTP errors as an `upstream_error` event.
- **Client** (`src/lib/cda/`) has a typed fetch wrapper with a `CdaError` type, rate-limit capture, and one retry on 429/503 that honours `Retry-After` (30 s max). It also holds defensive parsers and the stream manager. The stream manager backfills from `/stream/recent`, opens the live stream with `since_id`, resyncs on `lagged`, reconnects with exponential backoff, and falls back to the delayed feed for free or no-key access.
- **State.** TanStack Query handles polling: whales every 5 min, candles every 60 s, summaries every 3 min, all configurable. Zustand holds settings, rate limits and a 2,000-event ring buffer. The newest 500 events are persisted so the feed is populated on reload.

```
src/
  app/                    pages + API route handlers
  components/
    deck/                 WhaleDeck design components (panel, segmented control, KPI tile, coin logo, icons)
    layout/               sidebar, coin search, stream / tier / API usage widgets
    radar/                radar scope, selected-coin card, KPIs, history chart
    exposure/             Whale Exposure table
    accounts/             Whale Accounts table
    alerts/               live feed, event rows, exchange-flow spikes
    coin/                 lightweight-charts wrapper, markers, side cards
    settings/             settings page
    common/               gate notices, error states
    ui/                   shadcn/ui components
  hooks/                  access/tier gating, TanStack Query hooks
  lib/cda/                client, endpoints, parsers, types, stream manager
  stores/                 settings, rate limits, event buffer
```

## Screenshots

> Placeholders – add images to `docs/screenshots/` and update the links.

| Whale Radar | Coin chart | Alerts |
|---|---|---|
| ![Whale Radar](docs/screenshots/radar.png) | ![Coin chart](docs/screenshots/coin.png) | ![Alerts](docs/screenshots/alerts.png) |

## Data source

All data comes from the [CryptoDataApi](https://cryptodataapi.com/api) REST API and SSE event stream.
See the [API docs](https://cryptodataapi.com/api/docs) for endpoints and plan tiers. Nothing here is financial advice.

## Status

Milestones 0–4 from [PLAN.md](PLAN.md) are built: scaffold, Whale Radar, Whale Alerts, coin page and coin side panel. Traders, Market and Scanners are next.

## License

MIT
