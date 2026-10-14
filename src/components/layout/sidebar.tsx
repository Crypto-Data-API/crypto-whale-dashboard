"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fish } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-1 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-transfer/15 text-transfer">
        <Fish className="size-4" aria-hidden />
      </span>
      <span className="text-sm leading-tight">
        Whale Dashboard
        <span className="block text-[11px] font-normal text-muted-foreground">powered by CryptoDataApi</span>
      </span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-6" aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.soon && <span className="rounded border border-sidebar-border px-1 text-[10px] text-muted-foreground">soon</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
      <Brand />
      <SidebarNav />
      <p className="mt-auto px-1 text-[11px] leading-relaxed text-muted-foreground">
        Data:{" "}
        <a href="https://cryptodataapi.com" target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
          cryptodataapi.com
        </a>
        . Not financial advice.
      </p>
    </aside>
  );
}
