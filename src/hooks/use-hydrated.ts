"use client";

import { useSyncExternalStore } from "react";
import { useSettings } from "@/stores/settings";

const subscribe = (cb: () => void) => useSettings.persist.onFinishHydration(() => cb());
const getSnapshot = () => useSettings.persist.hasHydrated();
const getServerSnapshot = () => false;

/** True once persisted settings (API key etc.) have been loaded from localStorage. */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
