"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/config/navigation";
import { useSidebar } from "./sidebar-provider";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { Profile } from "@/types";

interface SidebarContentProps {
  profile?: Profile | null;
  dueCount?: number | null;
  forceExpanded?: boolean;
  onItemClick?: () => void;
}

export function SidebarContent({
  profile,
  dueCount,
  forceExpanded = false,
  onItemClick,
}: SidebarContentProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const { isCollapsed } = useSidebar();

  const showCollapsed = isCollapsed && !forceExpanded;

  const renderLink = (href: string, labelKey: string, icon: React.ComponentType<{ className?: string }>, isStudy = false) => {
    const isActive = pathname.startsWith(href);
    const Icon = icon;

    const linkEl = (
      <Link
        href={href}
        onClick={onItemClick}
        className={cn(
          "flex items-center rounded-lg px-3 py-2 text-sm transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <div className={cn("flex items-center w-full", showCollapsed ? "justify-center" : "gap-3")}>
          <Icon className="h-4 w-4 shrink-0" />
          {!showCollapsed && (
            <span className="truncate font-display uppercase tracking-wider text-xs font-semibold">
              {t(labelKey)}
            </span>
          )}
        </div>
        
        {isStudy && typeof dueCount === "number" && dueCount > 0 && !showCollapsed && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white shrink-0">
            {dueCount}
          </span>
        )}
        {isStudy && typeof dueCount === "number" && dueCount > 0 && showCollapsed && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-red-500" />
        )}
      </Link>
    );

    if (showCollapsed) {
      return (
        <Tooltip key={href} delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="relative w-full">{linkEl}</div>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {t(labelKey)}
            {isStudy && typeof dueCount === "number" && dueCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500/20 text-red-300 px-1 text-[9px] font-bold">
                {dueCount}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return <div key={href} className="w-full">{linkEl}</div>;
  };

  return (
    <div className="space-y-1 w-full">
      {navigationItems.map((item) =>
        renderLink(item.href, item.key, item.icon, item.href === "/study")
      )}
      
      {profile?.is_admin && (
        <>
          {renderLink("/admin", "admin", Shield)}
        </>
      )}
    </div>
  );
}
