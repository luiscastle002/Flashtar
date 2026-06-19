"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "./sidebar-provider";
import { useTranslations } from "next-intl";

interface SidebarToggleProps {
  className?: string;
}

export function SidebarToggle({ className }: SidebarToggleProps) {
  const { isCollapsed, toggleCollapsed } = useSidebar();
  const t = useTranslations("navigation");

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleCollapsed}
      className={className}
      aria-label={isCollapsed ? t("expand_sidebar") : t("collapse_sidebar")}
      title={isCollapsed ? t("expand_sidebar") : t("collapse_sidebar")}
    >
      {isCollapsed ? (
        <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
      ) : (
        <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}
