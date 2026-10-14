"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared wall clock that re-renders subscribers every `intervalMs`.
 * Reading Date.now() during render is impure; this keeps it in a timer.
 * Returns 0 during SSR so relative times render a placeholder.
 */
type Ticker = { now: number; subs: Set<() => void>; timer: ReturnType<typeof setInterval> | null };

const tickers = new Map<number, Ticker>();

function getTicker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { now: 0, subs: new Set(), timer: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

const subscribers = new Map<number, (cb: () => void) => () => void>();

function subscribeFor(intervalMs: number) {
  let fn = subscribers.get(intervalMs);
  if (!fn) {
    fn = (cb: () => void) => {
      const t = getTicker(intervalMs);
      t.subs.add(cb);
      if (!t.timer) {
        t.now = Date.now();
        t.timer = setInterval(() => {
          t.now = Date.now();
          for (const s of t.subs) s();
        }, intervalMs);
      }
      return () => {
        t.subs.delete(cb);
        if (t.subs.size === 0 && t.timer) {
          clearInterval(t.timer);
          t.timer = null;
        }
      };
    };
    subscribers.set(intervalMs, fn);
  }
  return fn;
}

export function useNow(intervalMs = 1000): number {
  return useSyncExternalStore(
    subscribeFor(intervalMs),
    () => getTicker(intervalMs).now,
    () => 0,
  );
}
