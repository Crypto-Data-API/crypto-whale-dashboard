"use client";

import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CoinSearch } from "./coin-search";
import { Brand, Sidebar, SidebarNav } from "./sidebar";
import { RateLimitMeter, StreamStatusDot, TierBadge } from "./status-widgets";

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 gap-6 p-4">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Dashboard sections</SheetDescription>
        <Brand />
        <SidebarNav onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4">
          <MobileNav />
          <CoinSearch className="w-full max-w-72 min-w-0 flex-1 sm:flex-none" />
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <RateLimitMeter />
            <StreamStatusDot />
            <TierBadge />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
