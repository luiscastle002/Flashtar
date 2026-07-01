"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-provider";
import { SidebarContent } from "./sidebar-content";
import { useTranslations } from "next-intl";
import type { Profile } from "@/types";

interface MobileSidebarProps {
  profile?: Profile | null;
  dueCount?: number | null;
  coursesDueCount?: number | null;
}

export function MobileSidebar({ profile, dueCount, coursesDueCount }: MobileSidebarProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
  const { isMobileOpen, setMobileOpen } = useSidebar();

  // Close drawer on path change (e.g. user clicked a link)
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden mr-2 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setMobileOpen(true)}
        aria-label={t("open_navigation")}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-6 flex flex-col gap-4">
          <SheetHeader className="text-left border-b pb-4">
            <SheetTitle className="flex items-center gap-2 font-display uppercase tracking-widest font-extrabold text-foreground">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashtar
            </SheetTitle>
            <SheetDescription className="sr-only">
              Mobile navigation menu for Flashtar dashboard
            </SheetDescription>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto py-2">
            <SidebarContent
              profile={profile}
              dueCount={dueCount}
              coursesDueCount={coursesDueCount}
              forceExpanded={true}
              onItemClick={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
