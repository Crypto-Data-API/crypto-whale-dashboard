"use client";

import { create } from "zustand";
import type { CdaEvent, EventOrigin } from "@/lib/cda/types";
import { parseEvent } from "@/lib/cda/parse";

export const RING_SIZE = 2000;
export const PERSIST_SIZE = 500;
const PERSIST_KEY = "cwd-stream-events-v1";
const PERSIST_THROTTLE_MS = 5000;

/** "sample": static build, bundled snapshot plus a periodic replay (no server, no stream). */
export type StreamMode = "live" | "delayed" | "sample" | "off";
export type StreamStatus = "idle" | "connecting" | "live" | "reconnecting" | "delayed" | "sample" | "error" | "off";

export interface StreamState {
  /** Ring buffer, ascending by id, at most RING_SIZE events. */
  events: CdaEvent[];
  /** Highest id received from the real-time path (backfill or SSE). */
  lastId: number | null;
  mode: StreamMode;
  status: StreamStatus;
  message: string | null;
  /** Wall-clock ms of the last received event or heartbeat. */
  lastActivityAt: number | null;
  /** Events received over SSE since the page loaded. */
  liveReceived: number;
  /** For delayed mode: end of the last fetched window (ms). */
  delayedWindowEnd: number | null;

  /** Adds events (dedupe by id), returns the ones that were new. */
  ingest: (events: CdaEvent[], origin: EventOrigin) => CdaEvent[];
  setStatus: (status: StreamStatus, message?: string | null) => void;
  setMode: (mode: StreamMode) => void;
  setLastId: (id: number | null) => void;
  touch: (at: number) => void;
  setDelayedWindowEnd: (ms: number | null) => void;
  clear: () => void;
}

const ids = new Set<number>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const events = useStream.getState().events.slice(-PERSIST_SIZE);
      window.localStorage.setItem(PERSIST_KEY, JSON.stringify(events));
    } catch {
      // Quota or privacy mode: persistence is best-effort.
    }
  }, PERSIST_THROTTLE_MS);
}

export const useStream = create<StreamState>()((set, get) => ({
  events: [],
  lastId: null,
  mode: "off",
  status: "idle",
  message: null,
  lastActivityAt: null,
  liveReceived: 0,
  delayedWindowEnd: null,

  ingest: (incoming, origin) => {
    if (!incoming.length) return [];
    const fresh: CdaEvent[] = [];
    for (const e of incoming) {
      if (ids.has(e.id)) continue;
      ids.add(e.id);
      fresh.push(origin === e.origin ? e : { ...e, origin });
    }
    if (!fresh.length) return [];
    const prev = get().events;
    let merged = prev.concat(fresh);
    const needsSort = prev.length > 0 && fresh.some((e) => e.id < prev[prev.length - 1].id);
    if (needsSort || fresh.length > 1) merged.sort((a, b) => a.id - b.id);
    if (merged.length > RING_SIZE) {
      const dropped = merged.slice(0, merged.length - RING_SIZE);
      for (const d of dropped) ids.delete(d.id);
      merged = merged.slice(-RING_SIZE);
    }
    const patch: Partial<StreamState> = { events: merged };
    if (origin === "live" || origin === "backfill") {
      const maxId = fresh.reduce((m, e) => (e.id > m ? e.id : m), get().lastId ?? 0);
      patch.lastId = maxId;
    }
    if (origin === "live") patch.liveReceived = get().liveReceived + fresh.length;
    set(patch);
    schedulePersist();
    return fresh.filter((e) => ids.has(e.id));
  },
  setStatus: (status, message = null) => set({ status, message }),
  setMode: (mode) => set({ mode }),
  setLastId: (id) => set({ lastId: id }),
  touch: (at) => set({ lastActivityAt: at }),
  setDelayedWindowEnd: (ms) => set({ delayedWindowEnd: ms }),
  clear: () => {
    ids.clear();
    set({ events: [], lastId: null, liveReceived: 0 });
    try {
      window.localStorage.removeItem(PERSIST_KEY);
    } catch {
      // ignore
    }
  },
}));

/** Load the last persisted events (called once on the client). */
export function restorePersistedEvents(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(PERSIST_KEY);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    const events = parsed.map(parseEvent).filter((e): e is CdaEvent => e !== null);
    return useStream.getState().ingest(events, "restored").length;
  } catch {
    return 0;
  }
}
