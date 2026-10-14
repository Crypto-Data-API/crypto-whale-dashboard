"use client";

import { useQuery } from "@tanstack/react-query";
import { useSettingsHydrated } from "@/hooks/use-hydrated";
import { isCdaError, keyFingerprint, type CdaError } from "@/lib/cda/client";
import { getKeyInfo } from "@/lib/cda/endpoints";
import { TIER_RANK, type KeyInfo, type Tier } from "@/lib/cda/types";
import { useSettings } from "@/stores/settings";

/** Minimum access an endpoint needs. "none" = keyless (e.g. /stream/delayed). */
export type Requirement = "none" | "any" | Tier;

/**
 * ok          : go ahead and query
 * loading     : settings or tier still loading
 * no-key      : no user key and no server demo key
 * upgrade     : tier is known and too low
 * invalid-key : /auth/keys/me said 401
 */
export type Gate = "ok" | "loading" | "no-key" | "upgrade" | "invalid-key";

export type KeySource = "user" | "server" | "none";

export interface Access {
  hydrated: boolean;
  demoMode: boolean;
  source: KeySource;
  /** Fingerprint of the key in use, for scoping caches. */
  fp: string;
  tier: Tier | null;
  keyInfo: KeyInfo | null;
  authLoading: boolean;
  authError: CdaError | null;
  gate: (req: Requirement) => Gate;
}

function useServerConfig() {
  return useQuery({
    queryKey: ["server-config"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/config", { signal, cache: "no-store" });
      if (!res.ok) return { demoKey: false };
      const j = (await res.json()) as { demoKey?: unknown };
      return { demoKey: j.demoKey === true };
    },
    staleTime: Infinity,
    retry: 1,
  });
}

/** Who we are talking to the API as, and what that key is allowed to do. */
export function useAccess(): Access {
  const hydrated = useSettingsHydrated();
  const apiKey = useSettings((s) => s.apiKey);
  const demoMode = useSettings((s) => s.demoMode);
  const storedInfo = useSettings((s) => s.keyInfo);
  const cfg = useServerConfig();

  const userKey = demoMode ? "" : apiKey;
  const source: KeySource = userKey ? "user" : cfg.data?.demoKey ? "server" : "none";
  const fp = source === "user" ? keyFingerprint(userKey) : source;

  const auth = useQuery({
    queryKey: ["auth-me", fp],
    queryFn: ({ signal }) => getKeyInfo({ signal }),
    enabled: hydrated && source !== "none",
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
    retry: (count, err) => !(isCdaError(err) && err.status > 0 && err.status < 500) && count < 2,
    refetchOnWindowFocus: false,
  });

  const authError = isCdaError(auth.error) ? auth.error : null;
  const keyInfo = auth.data ?? (source === "user" ? storedInfo : null);
  const tier = keyInfo?.tier ?? null;
  const authLoading = source !== "none" && auth.isPending && !keyInfo;

  const cfgPending = !userKey && cfg.isPending;

  const gate = (req: Requirement): Gate => {
    if (!hydrated) return "loading";
    if (req === "none") return "ok";
    if (cfgPending) return "loading";
    if (source === "none") return "no-key";
    if (authError?.isAuth) return "invalid-key";
    if (req === "any") return "ok";
    if (tier === null) return authLoading ? "loading" : "ok"; // unknown tier: try, 403 is handled
    return TIER_RANK[tier] >= TIER_RANK[req] ? "ok" : "upgrade";
  };

  return { hydrated, demoMode, source, fp, tier, keyInfo, authLoading, authError, gate };
}
