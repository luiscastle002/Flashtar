"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SpaceBackground } from "@/components/shared/space-background";
import { BlackHoleCompanion } from "@/components/shared/black-hole-companion";
import { LanguageSelector } from "@/components/shared/language-selector";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Profile, Subscription } from "@/types";
import { Button } from "@/components/ui/button";

interface DashboardShellClientProps {
  children: React.ReactNode;
  currentPath: string;
  profile?: Profile | null;
  subscription?: Subscription | null;
  defaultCollapsed?: boolean;
}

export function DashboardShellClient({
  children,
  currentPath,
  profile,
  subscription,
  defaultCollapsed = false,
}: DashboardShellClientProps) {
  return (
    <SidebarProvider defaultCollapsed={defaultCollapsed}>
      <TooltipProvider>
        <DashboardShellInner
          profile={profile}
          subscription={subscription}
          currentPath={currentPath}
        >
          {children}
        </DashboardShellInner>
      </TooltipProvider>
    </SidebarProvider>
  );
}

function DashboardShellInner({
  children,
  profile,
  subscription,
  currentPath,
}: {
  children: React.ReactNode;
  profile?: Profile | null;
  subscription?: Subscription | null;
  currentPath: string;
}) {
  const locale = useLocale();
  const router = useRouter();
  const tDashboard = useTranslations("dashboard");
  const [dueCount, setDueCount] = React.useState<number | null>(null);
  const [coursesDueCount, setCoursesDueCount] = React.useState<number | null>(null);

  // Synchronize database preferred language to NEXT_LOCALE cookie if they differ
  React.useEffect(() => {
    if (!profile) return;
    const dbLang = profile.preferred_language || "en";
    if (dbLang !== locale) {
      document.cookie = `NEXT_LOCALE=${dbLang}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    }
  }, [profile, locale, router]);

  // Synchronize browser timezone to USER_TIMEZONE cookie
  React.useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const currentTzCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith("USER_TIMEZONE="))
      ?.split("=")[1];

    if (tz && currentTzCookie !== tz) {
      document.cookie = `USER_TIMEZONE=${tz}; path=/; max-age=31536000; SameSite=Lax`;
      router.refresh();
    }
  }, [router]);

  // Poll for spacing repetition study due counts
  React.useEffect(() => {
    if (!profile) return;

    async function fetchDueCount() {
      try {
        const res = await fetch("/api/study/due-count");
        if (res.ok) {
          const data = await res.json();
          setDueCount(data.selfStudyDue ?? 0);
          setCoursesDueCount(data.coursesDue ?? 0);
        }
      } catch (err) {
        console.error("Error fetching due count:", err);
      }
    }

    fetchDueCount();
    const interval = setInterval(fetchDueCount, 2 * 60 * 1000); // Poll every 2 minutes
    return () => clearInterval(interval);
  }, [profile]);

  return (
    <div className="relative min-h-screen flex">
      <SpaceBackground />
      <div className="relative z-10 flex flex-1 min-w-0">
        
        {/* Collapsible Left Sidebar (Desktop) */}
        <AppSidebar profile={profile} dueCount={dueCount} coursesDueCount={coursesDueCount} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b flex items-center justify-between px-4 md:px-6">
            
            {/* Hamburger Trigger for Mobile Drawer */}
            <MobileSidebar profile={profile} dueCount={dueCount} coursesDueCount={coursesDueCount} />
            
            <div className="md:hidden">
              <Link href="/dashboard" className="flex items-center gap-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                <Sparkles className="h-5 w-5 text-primary" />
                Flashtar
              </Link>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              {currentPath === "/dashboard" && profile && subscription?.plan !== "pro" && (
                <Button size="sm" variant="outline" className="border-primary/30 hover:border-primary/80 hover:bg-primary/5 transition-colors gap-1.5" asChild>
                  <Link href="/plan">
                    <Sparkles className="h-3.5 w-3.5 text-primary fill-primary/10 animate-pulse" />
                    <span className="font-display text-xs font-semibold uppercase tracking-wider hidden sm:inline">
                      {tDashboard("upgrade_pro")}
                    </span>
                  </Link>
                </Button>
              )}
              <LanguageSelector />
              <ThemeToggle />
              <UserMenu profile={profile} />
            </div>
          </header>
          
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
      </div>
      <BlackHoleCompanion />
    </div>
  );
}
