"use client";

import { withBasePath } from "@/lib/deploy";
import { useStream } from "@/stores/stream";
import { isCdaError } from "./client";
import { getDelayedEvents, getRecentEvents } from "./endpoints";
import { asObj, num, parseEvent, pickStr } from "./parse";
import type { CdaEvent } from "./types";

/**
 * Client-side stream manager.
 *
 * live    : backfill GET /stream/recent?limit=500, then EventSource on our
 *           /api/cda/stream proxy with since_id=<last id>. Handles `lagged`,
 *           upstream errors, reconnect with exponential backoff, and a
 *           heartbeat watchdog (the proxy turns `: ping` comments into
 *           `event: ping` so the browser can see them).
 * delayed : poll GET /stream/delayed every 60s (no key needed).
 * sample  : static build only. Loads the snapshot's /stream/recent events,
 *           then replays a few of the newest ones every 20-40s, re-stamped to
 *           now with fresh ids, so the feed and sidebar counters move. Never
 *           touches the network beyond the bundled sample files.
 *
 * All events go through the Zustand ring buffer (dedupe by id).
 */

export type StreamConfig = { mode: "live" | "delayed" | "sample" | "off"; key: string };

type Listener = (events: CdaEvent[]) => void;

const DELAYED_POLL_MS = 60_000;
const WATCHDOG_INTERVAL_MS = 10_000;
const WATCHDOG_STALE_MS = 45_000;
const FLUSH_MS = 250;
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const SAMPLE_FIRST_REPLAY_MS = 6_000;
const SAMPLE_REPLAY_MIN_MS = 20_000;
const SAMPLE_REPLAY_MAX_MS = 40_000;
/** How many of the newest snapshot events per type the replay cycles through. */
const SAMPLE_REPLAY_PER_TYPE = 15;
/** Funding is hidden in the feed by default, so it is not replayed. */
const SAMPLE_REPLAY_TYPES = ["whale_position", "whale_transfer", "liquidation", "oi_delta", "price_move"];
const SAMPLE_NOTE = "Sample snapshot: recent events are replayed every 20-40 seconds. Live data needs a CryptoDataApi key.";
export const STREAM_COOKIE = "cda_key";

/**
 * EventSource cannot send headers, so the key travels as a cookie scoped to
 * the stream route only (never in the URL, so it never lands in access logs).
 */
export function setStreamKeyCookie(key: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const base = `${STREAM_COOKIE}=`;
  const cookiePath = withBasePath("/api/cda/stream");
  document.cookie = key
    ? `${base}${encodeURIComponent(key)}; Path=${cookiePath}; SameSite=Strict${secure}`
    : `${base}; Path=${cookiePath}; Max-Age=0; SameSite=Strict${secure}`;
}

class StreamManager {
  private config: StreamConfig | null = null;
  private generation = 0;
  private es: EventSource | null = null;
  private abort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private queue: CdaEvent[] = [];
  private backoff = MIN_BACKOFF_MS;
  private connectedOnce = false;
  private listeners = new Set<Listener>();
  /** Sample mode: snapshot events to replay (types interleaved, newest first) and the next one to use. */
  private replayPool: CdaEvent[] = [];
  private replayCursor = 0;

  /** Subscribe to events that arrived over the real-time SSE path. */
  onLiveEvents(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  start(config: StreamConfig) {
    if (this.config && this.config.mode === config.mode && this.config.key === config.key) return;
    this.stop();
    this.config = config;
    const gen = ++this.generation;
    const store = useStream.getState();
    store.setMode(config.mode);
    if (config.mode === "sample") {
      void this.startSample(gen);
      return;
    }
    setStreamKeyCookie(config.key);
    if (config.mode === "off") {
      store.setStatus("off");
      return;
    }
    if (config.mode === "delayed") this.startDelayed(gen, null);
    else void this.startLive(gen);
  }

  stop() {
    this.generation++;
    this.config = null;
    this.closeEs();
    this.abort?.abort();
    this.abort = null;
    for (const t of [this.reconnectTimer, this.pollTimer, this.flushTimer]) if (t) clearTimeout(t);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.reconnectTimer = this.pollTimer = this.flushTimer = null;
    this.watchdogTimer = null;
    this.flush();
    this.backoff = MIN_BACKOFF_MS;
    this.connectedOnce = false;
    this.replayPool = [];
    this.replayCursor = 0;
  }

  /** Force a reconnect (e.g. user pressed "reconnect"). */
  restart() {
    const cfg = this.config;
    if (!cfg) return;
    this.stop();
    this.start(cfg);
  }

  private stale(gen: number) {
    return gen !== this.generation;
  }

  private closeEs() {
    if (this.es) {
      this.es.onopen = null;
      this.es.onmessage = null;
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
  }

  /* ---------------------------- live ---------------------------- */

  private async startLive(gen: number) {
    const store = useStream.getState();
    store.setStatus("connecting", "Backfilling recent events");
    this.abort = new AbortController();
    try {
      const recent = await getRecentEvents({ limit: 500 }, { signal: this.abort.signal });
      if (this.stale(gen)) return;
      useStream.getState().ingest(recent.events, "backfill");
      if (recent.lastId !== null) {
        const cur = useStream.getState().lastId ?? 0;
        useStream.getState().setLastId(Math.max(cur, recent.lastId));
      }
    } catch (err) {
      if (this.stale(gen)) return;
      if (isCdaError(err) && (err.isAuth || err.isTierGate)) {
        this.fallbackToDelayed(gen, err.isAuth ? "API key rejected; showing the 30-minute delayed feed." : err.message);
        return;
      }
      // Backfill is best-effort: still try to open the live stream.
    }
    this.openEventSource(gen);
    this.startWatchdog(gen);
  }

  private openEventSource(gen: number) {
    if (this.stale(gen)) return;
    this.closeEs();
    const store = useStream.getState();
    const lastId = store.lastId;
    const url = withBasePath(`/api/cda/stream${lastId ? `?since_id=${encodeURIComponent(String(lastId))}` : ""}`);
    store.setStatus(this.connectedOnce ? "reconnecting" : "connecting", null);
    const es = new EventSource(url);
    this.es = es;

    es.onopen = () => {
      if (this.stale(gen)) return;
      this.connectedOnce = true;
      useStream.getState().touch(Date.now());
      useStream.getState().setStatus("live", null);
    };

    es.onmessage = (msg: MessageEvent<string>) => {
      if (this.stale(gen)) return;
      let data: unknown;
      try {
        data = JSON.parse(msg.data);
      } catch {
        return;
      }
      const ev = parseEvent(data);
      useStream.getState().touch(Date.now());
      if (!ev) return;
      this.backoff = MIN_BACKOFF_MS;
      this.enqueue(ev);
      if (useStream.getState().status !== "live") useStream.getState().setStatus("live", null);
    };

    es.addEventListener("ping", () => {
      if (this.stale(gen)) return;
      useStream.getState().touch(Date.now());
    });

    es.addEventListener("lagged", () => {
      if (this.stale(gen)) return;
      // Server dropped us for falling behind: reconnect from our last id.
      this.flush();
      this.scheduleReconnect(gen, 250, "Stream lagged; resyncing from last event");
    });

    es.addEventListener("upstream_error", (msg) => {
      if (this.stale(gen)) return;
      const info = asObj(safeJson((msg as MessageEvent<string>).data));
      const status = num(info.status) ?? 0;
      const message = pickStr(info, "message") ?? `Stream error (HTTP ${status})`;
      const retryAfter = num(info.retry_after);
      this.closeEs();
      if (status === 401 || status === 402 || status === 403) {
        this.fallbackToDelayed(gen, status === 401 ? "API key rejected; showing the 30-minute delayed feed." : `${message} Showing the 30-minute delayed feed.`);
      } else if (status === 429) {
        this.scheduleReconnect(gen, Math.min(120, retryAfter ?? 30) * 1000, "Rate limited; retrying");
      } else {
        this.scheduleReconnect(gen, this.nextBackoff(), message);
      }
    });

    es.onerror = () => {
      if (this.stale(gen)) return;
      // We manage reconnects ourselves so since_id is always current.
      this.closeEs();
      this.scheduleReconnect(gen, this.nextBackoff(), "Connection lost; reconnecting");
    };
  }

  private scheduleReconnect(gen: number, delayMs: number, message: string) {
    if (this.stale(gen)) return;
    this.closeEs();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    useStream.getState().setStatus("reconnecting", message);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openEventSource(gen);
    }, delayMs);
  }

  private nextBackoff(): number {
    const d = this.backoff + Math.floor(Math.random() * 500);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    return d;
  }

  private startWatchdog(gen: number) {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => {
      if (this.stale(gen)) return;
      const { lastActivityAt, status } = useStream.getState();
      if (status !== "live") return;
      if (lastActivityAt !== null && Date.now() - lastActivityAt > WATCHDOG_STALE_MS) {
        this.scheduleReconnect(gen, 0, "No heartbeat; reconnecting");
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  private fallbackToDelayed(gen: number, note: string) {
    if (this.stale(gen)) return;
    this.closeEs();
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    useStream.getState().setMode("delayed");
    this.startDelayed(gen, note);
  }

  /* --------------------------- delayed -------------------------- */

  private startDelayed(gen: number, note: string | null) {
    useStream.getState().setStatus("delayed", note);
    if (!this.abort) this.abort = new AbortController();
    const signal = this.abort.signal;
    const poll = async () => {
      try {
        const res = await getDelayedEvents({ signal });
        if (this.stale(gen)) return;
        const st = useStream.getState();
        st.ingest(res.events, "delayed");
        st.setDelayedWindowEnd(res.windowEnd);
        st.touch(Date.now());
        st.setStatus("delayed", note);
      } catch (err) {
        if (this.stale(gen)) return;
        useStream.getState().setStatus("error", isCdaError(err) ? err.message : "Could not load the delayed feed");
      }
      if (!this.stale(gen)) this.pollTimer = setTimeout(poll, DELAYED_POLL_MS);
    };
    void poll();
  }

  /* --------------------------- sample --------------------------- */

  private async startSample(gen: number) {
    useStream.getState().setStatus("connecting", "Loading the sample snapshot");
    this.abort = new AbortController();
    try {
      const recent = await getRecentEvents({ limit: 500 }, { signal: this.abort.signal });
      if (this.stale(gen)) return;
      useStream.getState().ingest(recent.events, "sample");
      this.replayPool = buildReplayPool(recent.events);
      // Random start so every page load does not replay the same events first.
      this.replayCursor = Math.floor(Math.random() * this.replayPool.length);
    } catch (err) {
      if (this.stale(gen)) return;
      useStream.getState().setStatus("error", isCdaError(err) ? err.message : "Could not load the sample events");
      return;
    }
    useStream.getState().touch(Date.now());
    useStream.getState().setStatus("sample", SAMPLE_NOTE);
    this.scheduleReplay(gen, SAMPLE_FIRST_REPLAY_MS);
  }

  private scheduleReplay(gen: number, delayMs: number) {
    if (this.stale(gen) || this.replayPool.length === 0) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      if (this.stale(gen)) return;
      this.replaySample();
      this.scheduleReplay(gen, SAMPLE_REPLAY_MIN_MS + Math.random() * (SAMPLE_REPLAY_MAX_MS - SAMPLE_REPLAY_MIN_MS));
    }, delayMs);
  }

  /** Re-emits 1-3 of the newest snapshot events as if they had just arrived. */
  private replaySample() {
    const pool = this.replayPool;
    const st = useStream.getState();
    const now = Date.now();
    const count = 1 + Math.floor(Math.random() * Math.min(3, pool.length));
    // Fresh ids above everything buffered (including events restored from a previous visit).
    const queuedMax = this.queue.reduce((m, e) => Math.max(m, e.id), 0);
    let nextId = Math.max(st.events.length ? st.events[st.events.length - 1].id : 0, queuedMax) + 1;
    for (let i = 0; i < count; i++) {
      const src = pool[this.replayCursor % pool.length];
      this.replayCursor++;
      const ts = now - (count - 1 - i) * 350;
      this.enqueue({ ...src, id: nextId++, ts, recv_ts: ts, origin: "live" });
    }
    st.touch(now);
  }

  /* --------------------------- batching ------------------------- */

  private enqueue(ev: CdaEvent) {
    this.queue.push(ev);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
  }

  private flush() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.queue.length) return;
    const batch = this.queue;
    this.queue = [];
    const fresh = useStream.getState().ingest(batch, "live");
    if (fresh.length) for (const fn of this.listeners) fn(fresh);
  }
}

/**
 * Newest events of each replayable type, interleaved round-robin so
 * consecutive replays differ (liquidation, OI change, price move, ...).
 * Falls back to the newest events of any type.
 */
function buildReplayPool(events: CdaEvent[]): CdaEvent[] {
  const byType = SAMPLE_REPLAY_TYPES.map((t) =>
    events
      .filter((e) => e.type === t)
      .slice(-SAMPLE_REPLAY_PER_TYPE)
      .reverse(),
  ).filter((list) => list.length > 0);
  if (byType.length === 0) return events.slice(-SAMPLE_REPLAY_PER_TYPE).reverse();
  const pool: CdaEvent[] = [];
  for (let i = 0; i < SAMPLE_REPLAY_PER_TYPE; i++) for (const list of byType) if (list[i]) pool.push(list[i]);
  return pool;
}

function safeJson(s: unknown): unknown {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const streamManager = new StreamManager();
