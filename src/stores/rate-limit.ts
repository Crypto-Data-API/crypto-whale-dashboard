"use client";

import { create } from "zustand";

export interface RateLimitState {
  limitDay: number | null;
  remainingDay: number | null;
  limitMinute: number | null;
  remainingMinute: number | null;
  /** epoch seconds */
  resetDay: number | null;
  resetMinute: number | null;
  updatedAt: number | null;
  /** Last time the API answered 429, ms. */
  last429At: number | null;
  record: (headers: Headers, at: number) => void;
  mark429: (at: number) => void;
  reset: () => void;
}

function h(headers: Headers, name: string): number | null {
  const v = headers.get(name);
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const EMPTY = {
  limitDay: null,
  remainingDay: null,
  limitMinute: null,
  remainingMinute: null,
  resetDay: null,
  resetMinute: null,
  updatedAt: null,
  last429At: null,
};

/** Latest X-RateLimit-* values seen on any proxied response. */
export const useRateLimit = create<RateLimitState>()((set) => ({
  ...EMPTY,
  record: (headers, at) => {
    const limitDay = h(headers, "x-ratelimit-limit-day");
    const remainingDay = h(headers, "x-ratelimit-remaining-day");
    const limitMinute = h(headers, "x-ratelimit-limit-minute");
    const remainingMinute = h(headers, "x-ratelimit-remaining-minute");
    // Cached upstream responses omit the headers entirely; keep the last values.
    if (limitDay === null && remainingDay === null && limitMinute === null && remainingMinute === null) return;
    set((s) => ({
      limitDay: limitDay ?? s.limitDay,
      remainingDay: remainingDay ?? s.remainingDay,
      limitMinute: limitMinute ?? s.limitMinute,
      remainingMinute: remainingMinute ?? s.remainingMinute,
      resetDay: h(headers, "x-ratelimit-reset-day") ?? s.resetDay,
      resetMinute: h(headers, "x-ratelimit-reset-minute") ?? s.resetMinute,
      updatedAt: at,
    }));
  },
  mark429: (at) => set({ last429At: at }),
  reset: () => set(EMPTY),
}));
