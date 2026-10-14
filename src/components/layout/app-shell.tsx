"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MenuIcon, WhaleMark } from "@/components/deck/icons";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar, SidebarBody } from "./sidebar";
import { LiveIndicator, TierPill } from "./status-widgets";

/** Top bar shown below the lg breakpoint: menu button (drawer), logo, stream + tier. */
function MobileBar() {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-iris/10 bg-[rgba(6,7,14,.85)] px-4 backdrop-blur-[12px] lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-[10px] border border-iris/16 bg-field text-ink-soft hover:text-ink"
          >
            <MenuIcon size={18} />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[264px] gap-0 overflow-y-auto border-iris/10 bg-[#06070e] px-3.5 py-[18px] sm:max-w-[264px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Dashboard sections</SheetDescription>
          <div className="flex min-h-full flex-col">
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <Link href="/" className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-[8px]" style={{ background: "linear-gradient(135deg,#00f5d4,#4d7cff 55%,#ff2d75)" }}>
          <WhaleMark size={18} />
        </span>
        <span className="font-display text-[15px] font-bold tracking-[.04em]">
          WHALE<span className="text-long">DESK</span>
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <LiveIndicator />
        <TierPill />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar />
        <main className="mx-auto flex w-full max-w-[1680px] min-w-0 flex-col gap-[22px] px-4 py-5 sm:p-7">{children}</main>
      </div>
    </div>
  );
}
