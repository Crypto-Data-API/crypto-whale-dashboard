# Crypto Whale Dashboard

A real-time dashboard for tracking crypto whale activity, powered by [CryptoDataApi.com](https://cryptodataapi.com).

## What it does

- **Whale Radar** – see which coins Hyperliquid whales are leaning long or short, sized by notional and ranked against their 30-day norm.
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

Open http://localhost:3000, go to **Settings**, paste your CryptoDataApi key and press **Test & Save**.
The key is checked against `GET /auth/keys/me`, and the tier badge, rate-limit meter and features update immediately.

Production build:

```bash
npm run build
npm start
```

Other scripts: `npm run lint`.

### Optional server-side demo key

Copy `.env.example` to `.env.local` and set `CDA_DEMO_KEY` to use a server-side key whenever a visitor has not entered their own. This is meant for a hosted public demo: every visitor without a key spends this key's rate limit.

```bash
CDA_DEMO_KEY=cdk_live_...
```

The app reads only `CDA_DEMO_KEY` (and optionally `CDA_API_BASE`). Any other variables in `.env` are ignored.

## What each tier unlocks

| Feature | No key | Free | Pro | Pro Plus |
|---|---|---|---|---|
| Alerts feed | 30-min delayed (`/stream/delayed`) | 30-min delayed | Live SSE | Live SSE |
| Coin chart candles, funding/OI, news | – | ✓ | ✓ | ✓ |
| Whale Radar (`/quant/whales`) | sample data | preview / upsell | ✓ | ✓ |
| CVD pane (`/hyperliquid/trade-flow`) | – | – | ✓ | ✓ |
| Quant outlook (`/quant/coins/{symbol}`) | – | – | ✓ | ✓ |
| 180-day whale history | – | – | – | ✓ |

Cards show a "Requires Pro" or "Add your API key" state instead of an error when the tier does not cover an endpoint.

## How it works

```
Browser ── x-cda-key header ──▶ /api/cda/[...path] ──X-API-Key──▶ cryptodataapi.com/api/v1/...
Browser ── EventSource + cookie ─▶ /api/cda/stream ───X-API-Key──▶ cryptodataapi.com/api/v1/stream
```

- **Key handling.** The key lives in `localStorage` (a persisted Zustand store) and is sent only to this app's own route handlers, which forward it upstream. Route handlers never log it. `EventSource` cannot set headers, so the stream route reads the key from a `cda_key` cookie scoped to `/api/cda/stream` rather than from the URL.
- **REST proxy** (`src/app/api/cda/[...path]/route.ts`) passes through status codes, JSON bodies, `X-RateLimit-*` and `Retry-After`.
- **SSE proxy** (`src/app/api/cda/stream/route.ts`) pipes frames through with no extra buffering, turns `: ping` comments into `event: ping` for the client watchdog, and reports upstream HTTP errors as an `upstream_error` event.
- **Client** (`src/lib/cda/`) has a typed fetch wrapper with a `CdaError` type, rate-limit capture, and one retry on 429/503 that honours `Retry-After` (30 s max). It also holds defensive parsers and the stream manager. The stream manager backfills from `/stream/recent`, opens the live stream with `since_id`, resyncs on `lagged`, reconnects with exponential backoff, and falls back to the delayed feed for free or no-key access.
- **State.** TanStack Query handles polling: whales every 5 min, candles every 60 s, summaries every 3 min, all configurable. Zustand holds settings, rate limits and a 2,000-event ring buffer. The newest 500 events are persisted so the feed is populated on reload.

```
src/
  app/                    pages + API route handlers
  components/
    layout/               sidebar, header, coin search, status widgets
    radar/                radar SVG, whale table, stats, history chart
    alerts/               live feed, event rows, exchange-flow spikes
    coin/                 lightweight-charts wrapper, markers, side cards
    settings/             settings page
    common/               gate notices, stat tile, stubs
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
