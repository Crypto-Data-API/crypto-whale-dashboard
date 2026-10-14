import { Activity, Bell, Radar, ScanSearch, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Whale Radar", icon: Radar },
  { href: "/alerts", label: "Whale Alerts", icon: Bell },
  { href: "/traders", label: "Traders", icon: Users, soon: true },
  { href: "/market", label: "Market", icon: Activity, soon: true },
  { href: "/scanners", label: "Scanners", icon: ScanSearch, soon: true },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const QUICK_COINS = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE"];
