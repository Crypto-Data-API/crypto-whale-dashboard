"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChartInterval, EventType, KeyInfo } from "@/lib/cda/types";
import { CHART_INTERVALS, EVENT_TYPES } from "@/lib/cda/types";
import { parseTier } from "@/lib/cda/parse";

/**
 * Alert thresholds per event type. Units:
 *  - liquidation / whale_transfer / whale_position / oi_delta: absolute USD
 *  - price_move: absolute % move
 *  - funding: absolute hourly rate in % (0.05 = 0.05%/h)
 */
export type Thresholds = Record<EventType, number>;

export interface RefreshSettings {
  whalesSec: number;
  candlesSec: number;
  summariesSec: number;
}

export interface FeedPrefs {
  types: Record<EventType, boolean>;
  minUsd: number;
  symbols: string;
  sound: boolean;
  notifications: boolean;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  whale_position: 250_000,
  whale_transfer: 5_000_000,
  liquidation: 250_000,
  oi_delta: 10_000_000,
  price_move: 2,
  funding: 0.05,
};

export const DEFAULT_REFRESH: RefreshSettings = { whalesSec: 300, candlesSec: 60, summariesSec: 180 };

/** Lower bounds so a mistyped value cannot burn the rate-limit budget. */
export const MIN_REFRESH: RefreshSettings = { whalesSec: 60, candlesSec: 15, summariesSec: 60 };

export const DEFAULT_FEED: FeedPrefs = {
  types: {
    whale_position: true,
    whale_transfer: true,
    liquidation: true,
    oi_delta: true,
    price_move: true,
    funding: false,
  },
  minUsd: 0,
  symbols: "",
  sound: false,
  notifications: false,
};

export type ChartStyle = "candles" | "line";
export const CHART_STYLES: ChartStyle[] = ["candles", "line"];

export interface SettingsState {
  apiKey: string;
  /** Result of the last successful /auth/keys/me for `apiKey`. */
  keyInfo: KeyInfo | null;
  demoMode: boolean;
  defaultInterval: ChartInterval;
  chartStyle: ChartStyle;
  refresh: RefreshSettings;
  thresholds: Thresholds;
  feed: FeedPrefs;

  setApiKey: (key: string, info: KeyInfo | null) => void;
  setKeyInfo: (info: KeyInfo | null) => void;
  clearKey: () => void;
  setDemoMode: (on: boolean) => void;
  setDefaultInterval: (interval: ChartInterval) => void;
  setChartStyle: (style: ChartStyle) => void;
  setRefresh: (patch: Partial<RefreshSettings>) => void;
  setThreshold: (type: EventType, value: number) => void;
  setFeed: (patch: Partial<FeedPrefs>) => void;
  setFeedType: (type: EventType, on: boolean) => void;
  importSettings: (data: unknown) => { ok: boolean; message: string };
  resetPreferences: () => void;
}

export type ExportedSettings = {
  app: "crypto-whale-dashboard";
  version: 1;
  exportedAt: string;
  settings: {
    apiKey?: string;
    demoMode: boolean;
    defaultInterval: ChartInterval;
    chartStyle?: ChartStyle;
    refresh: RefreshSettings;
    thresholds: Thresholds;
    feed: FeedPrefs;
  };
};

function clampRefresh(r: Partial<RefreshSettings>, base: RefreshSettings): RefreshSettings {
  const out = { ...base };
  (Object.keys(MIN_REFRESH) as (keyof RefreshSettings)[]).forEach((k) => {
    const v = r[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(MIN_REFRESH[k], Math.round(v));
  });
  return out;
}

function sanitizeThresholds(t: unknown, base: Thresholds): Thresholds {
  const out = { ...base };
  if (t && typeof t === "object") {
    for (const type of EVENT_TYPES) {
      const v = (t as Record<string, unknown>)[type];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[type] = v;
    }
  }
  return out;
}

function sanitizeFeed(f: unknown, base: FeedPrefs): FeedPrefs {
  if (!f || typeof f !== "object") return base;
  const src = f as Record<string, unknown>;
  const types = { ...base.types };
  if (src.types && typeof src.types === "object") {
    for (const type of EVENT_TYPES) {
      const v = (src.types as Record<string, unknown>)[type];
      if (typeof v === "boolean") types[type] = v;
    }
  }
  return {
    types,
    minUsd: typeof src.minUsd === "number" && src.minUsd >= 0 ? src.minUsd : base.minUsd,
    symbols: typeof src.symbols === "string" ? src.symbols.slice(0, 200) : base.symbols,
    sound: typeof src.sound === "boolean" ? src.sound : base.sound,
    notifications: typeof src.notifications === "boolean" ? src.notifications : base.notifications,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      apiKey: "",
      keyInfo: null,
      demoMode: false,
      defaultInterval: "1h",
      chartStyle: "candles",
      refresh: DEFAULT_REFRESH,
      thresholds: DEFAULT_THRESHOLDS,
      feed: DEFAULT_FEED,

      setApiKey: (key, info) => set({ apiKey: key.trim(), keyInfo: info, demoMode: false }),
      setKeyInfo: (info) => set({ keyInfo: info }),
      clearKey: () => set({ apiKey: "", keyInfo: null }),
      setDemoMode: (on) => set({ demoMode: on }),
      setDefaultInterval: (interval) => set({ defaultInterval: interval }),
      setChartStyle: (style) => set({ chartStyle: style }),
      setRefresh: (patch) => set({ refresh: clampRefresh(patch, get().refresh) }),
      setThreshold: (type, value) =>
        set({ thresholds: { ...get().thresholds, [type]: Number.isFinite(value) && value >= 0 ? value : 0 } }),
      setFeed: (patch) => set({ feed: { ...get().feed, ...patch } }),
      setFeedType: (type, on) => set({ feed: { ...get().feed, types: { ...get().feed.types, [type]: on } } }),

      importSettings: (data) => {
        if (!data || typeof data !== "object") return { ok: false, message: "File is not a JSON object." };
        const root = data as Record<string, unknown>;
        const s = (root.settings && typeof root.settings === "object" ? root.settings : root) as Record<string, unknown>;
        const cur = get();
        const patch: Partial<SettingsState> = {
          refresh: clampRefresh((s.refresh as Partial<RefreshSettings>) ?? {}, cur.refresh),
          thresholds: sanitizeThresholds(s.thresholds, cur.thresholds),
          feed: sanitizeFeed(s.feed, cur.feed),
        };
        if (typeof s.demoMode === "boolean") patch.demoMode = s.demoMode;
        if (typeof s.defaultInterval === "string" && (CHART_INTERVALS as string[]).includes(s.defaultInterval)) {
          patch.defaultInterval = s.defaultInterval as ChartInterval;
        }
        if (typeof s.chartStyle === "string" && (CHART_STYLES as string[]).includes(s.chartStyle)) {
          patch.chartStyle = s.chartStyle as ChartStyle;
        }
        let keyNote = "";
        if (typeof s.apiKey === "string" && s.apiKey.trim().length > 8) {
          patch.apiKey = s.apiKey.trim();
          patch.keyInfo = null;
          keyNote = " API key imported; run Test & Save to verify it.";
        }
        set(patch);
        return { ok: true, message: `Settings imported.${keyNote}` };
      },

      resetPreferences: () =>
        set({
          defaultInterval: "1h",
          chartStyle: "candles",
          refresh: DEFAULT_REFRESH,
          thresholds: DEFAULT_THRESHOLDS,
          feed: DEFAULT_FEED,
        }),
    }),
    {
      name: "cwd-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Rehydrated manually on the client (see Providers) to avoid SSR mismatches.
      skipHydration: true,
      partialize: (s) => ({
        apiKey: s.apiKey,
        keyInfo: s.keyInfo,
        demoMode: s.demoMode,
        defaultInterval: s.defaultInterval,
        chartStyle: s.chartStyle,
        refresh: s.refresh,
        thresholds: s.thresholds,
        feed: s.feed,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        const keyInfo = p.keyInfo && parseTier(p.keyInfo.tier) ? p.keyInfo : null;
        return {
          ...current,
          apiKey: typeof p.apiKey === "string" ? p.apiKey : current.apiKey,
          keyInfo,
          demoMode: typeof p.demoMode === "boolean" ? p.demoMode : current.demoMode,
          defaultInterval:
            typeof p.defaultInterval === "string" && (CHART_INTERVALS as string[]).includes(p.defaultInterval)
              ? p.defaultInterval
              : current.defaultInterval,
          chartStyle: p.chartStyle === "line" || p.chartStyle === "candles" ? p.chartStyle : current.chartStyle,
          refresh: clampRefresh(p.refresh ?? {}, current.refresh),
          thresholds: sanitizeThresholds(p.thresholds, current.thresholds),
          feed: sanitizeFeed(p.feed, current.feed),
        };
      },
    },
  ),
);

export function exportSettings(includeKey: boolean): ExportedSettings {
  const s = useSettings.getState();
  return {
    app: "crypto-whale-dashboard",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: {
      ...(includeKey && s.apiKey ? { apiKey: s.apiKey } : {}),
      demoMode: s.demoMode,
      defaultInterval: s.defaultInterval,
      chartStyle: s.chartStyle,
      refresh: s.refresh,
      thresholds: s.thresholds,
      feed: s.feed,
    },
  };
}
