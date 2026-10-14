import { Bell, Radar, Settings, Users, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Whale Radar", icon: Radar },
  { href: "/alerts", label: "Whale Alerts", icon: Bell },
  { href: "/accounts", label: "Whale Accounts", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];
