import { LayoutDashboard, BookOpen, Sparkles, Layers, BarChart3, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  key: "dashboard" | "study" | "generate" | "decks" | "statistics" | "settings";
  icon: LucideIcon;
  adminOnly?: boolean;
}

export const navigationItems: NavItem[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/study",     key: "study",     icon: BookOpen },
  { href: "/generate",  key: "generate",  icon: Sparkles },
  { href: "/decks",     key: "decks",     icon: Layers },
  { href: "/stats",     key: "statistics",icon: BarChart3 },
  { href: "/settings",  key: "settings",  icon: Settings },
];
