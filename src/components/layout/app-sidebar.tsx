"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-provider";
import { SidebarContent } from "./sidebar-content";
import { SidebarToggle } from "./sidebar-toggle";
import type { Profile } from "@/types";

interface AppSidebarProps {
  profile?: Profile | null;
  dueCount?: number | null;
  coursesDueCount?: number | null;
}

export function AppSidebar({
  profile,
  dueCount,
  coursesDueCount,
}: AppSidebarProps) {
  const { isCollapsed } = useSidebar();

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r bg-card/85 backdrop-blur-sm transition-all duration-300 ease-in-out shrink-0 select-none",
        isCollapsed ? "w-16" : "w-64",
      )}
    >
      {/* Sidebar Header (Logo) */}
      <div
        className={cn(
          "h-16 flex items-center border-b px-6 transition-all duration-300",
          isCollapsed ? "justify-center px-0" : "justify-start",
        )}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-display uppercase tracking-widest font-semibold select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          {!isCollapsed && (
            <span className="animate-in fade-in duration-300">Flashtar</span>
          )}
        </Link>
      </div>

      {/* Navigation Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin">
        <SidebarContent
          profile={profile}
          dueCount={dueCount}
          coursesDueCount={coursesDueCount}
        />
      </div>

      {/* Sidebar Footer (Toggle) */}
      <div
        className={cn(
          "p-3 border-t flex transition-all duration-300",
          isCollapsed ? "justify-center" : "justify-between items-center",
        )}
      >
        {!isCollapsed && (
          <span className="text-[10px] text-muted-foreground/60 select-none animate-in fade-in duration-300">
            Flashtar v1.0.9
          </span>
        )}
        <SidebarToggle className="h-8 w-8" />
      </div>
    </aside>
  );
}
