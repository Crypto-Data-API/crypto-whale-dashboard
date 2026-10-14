import type { ComponentType } from "react";
import { AccountsIcon, BellIcon, ExposureIcon, GearIcon, RadarIcon } from "@/components/deck/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; stroke?: string; className?: string }>;
  /** Extra path prefixes that count as this section (coin pages belong to the radar). */
  also?: string[];
  /** Show the live alert counter pill. */
  alertCount?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Whale Radar", icon: RadarIcon, also: ["/coin/"] },
  { href: "/exposure", label: "Whale Exposure", icon: ExposureIcon },
  { href: "/alerts", label: "Whale Alerts", icon: BellIcon, alertCount: true },
  { href: "/accounts", label: "Whale Accounts", icon: AccountsIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.also?.some((p) => pathname.startsWith(p))) return true;
  return item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
