"use client";

import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { useAccess, type Gate, type Requirement } from "@/hooks/use-access";
import { CdaError, isCdaError } from "@/lib/cda/client";
import type { Tier } from "@/lib/cda/types";

export interface CdaQueryOptions<T> {
  /** Cache key (without the key fingerprint, which is added automatically). */
  key: QueryKey;
  fn: (signal: AbortSignal) => Promise<T>;
  requires: Requirement;
  /** Poll interval in ms (false = no polling). Polling stops on tier/auth errors. */
  refetchMs?: number | false;
  staleMs?: number;
  enabled?: boolean;
  keepPrevious?: boolean;
}

export interface CdaQueryResult<T> {
  data: T | undefined;
  error: CdaError | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
  /** Access state after taking API errors into account. */
  gate: Gate;
  requiredTier: Tier | null;
}

/**
 * TanStack Query wrapper for CDA endpoints: scopes caches per key, waits for
 * settings hydration, skips calls the current tier cannot make, and turns
 * 402/403 responses into an "upgrade" gate instead of an error state.
 */
export function useCdaQuery<T>(opts: CdaQueryOptions<T>): CdaQueryResult<T> {
  const access = useAccess();
  const baseGate = access.gate(opts.requires);
  const q = useQuery({
    queryKey: ["cda", access.fp, ...opts.key],
    queryFn: ({ signal }) => opts.fn(signal),
    enabled: baseGate === "ok" && (opts.enabled ?? true),
    staleTime: opts.staleMs ?? (typeof opts.refetchMs === "number" ? Math.floor(opts.refetchMs / 2) : 60_000),
    refetchInterval: (query) => {
      const err = query.state.error;
      if (isCdaError(err) && (err.isTierGate || err.isAuth)) return false;
      return opts.refetchMs ?? false;
    },
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined,
  });

  const error = q.error
    ? isCdaError(q.error)
      ? q.error
      : new CdaError({ status: 0, code: "client_error", message: q.error instanceof Error ? q.error.message : "Unexpected error" })
    : null;
  let gate: Gate = baseGate;
  if (gate === "ok" && error?.isTierGate) gate = "upgrade";
  if (gate === "ok" && error?.isAuth) gate = "invalid-key";
  const reqTier: Tier | null = opts.requires === "none" || opts.requires === "any" ? null : opts.requires;

  return {
    data: q.data,
    error,
    isLoading: q.isLoading || (baseGate === "loading" && !q.data),
    isFetching: q.isFetching,
    isError: q.isError,
    dataUpdatedAt: q.dataUpdatedAt,
    refetch: () => void q.refetch(),
    gate,
    requiredTier: error?.requiredTier ?? reqTier,
  };
}
