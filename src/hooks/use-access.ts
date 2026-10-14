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

export type KeySource = "user" | "server" | "sample" | "none";

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
  /** The server has CDA_API_KEY configured (from GET /api/cda/_status). */
  hasServerKey: boolean;
  /** Bundled sample snapshots (public/sample) are available. */
  hasSampleData: boolean;
  gate: (req: Requirement) => Gate;
}

/** GET /api/cda/_status -> { hasServerKey, hasSampleData } (never the key itself). */
function useServerStatus() {
  return useQuery({
    queryKey: ["cda-status"],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/cda/_status", { signal, cache: "no-store" });
      if (!res.ok) return { hasServerKey: false, hasSampleData: false };
      const j = (await res.json()) as { hasServerKey?: unknown; hasSampleData?: unknown };
      return { hasServerKey: j.hasServerKey === true, hasSampleData: j.hasSampleData === true };
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
  const cfg = useServerStatus();
  const hasServerKey = cfg.data?.hasServerKey === true;
  const hasSampleData = cfg.data?.hasSampleData === true;

  const userKey = demoMode ? "" : apiKey;
  // Demo mode skips the server key too, so it always shows the bundled sample data.
  const source: KeySource = userKey ? "user" : hasServerKey && !demoMode ? "server" : hasSampleData ? "sample" : "none";
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

  return { hydrated, demoMode, source, fp, tier, keyInfo, authLoading, authError, hasServerKey, hasSampleData, gate };
}
