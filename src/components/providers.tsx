"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { AlertNotifier, KeyInfoSync, StreamController } from "@/components/background-controllers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isCdaError } from "@/lib/cda/client";
import { useSettings } from "@/stores/settings";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        // 4xx answers (auth, tier, validation) will not change on retry.
        retry: (count, err) => {
          if (isCdaError(err) && err.status >= 400 && err.status < 500) return false;
          return count < 2;
        },
        retryDelay: (attempt) => Math.min(30_000, 2_000 * 2 ** attempt),
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={150}>
        {children}
        <StreamController />
        <AlertNotifier />
        <KeyInfoSync />
      </TooltipProvider>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
