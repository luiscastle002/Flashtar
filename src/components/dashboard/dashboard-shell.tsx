"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Sparkles,
  Layers,
  Settings,
  Shield,
  LogOut,
  BookOpen,
} from "lucide-react";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { SpaceBackground } from "@/components/shared/space-background";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Profile } from "@/types";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/study",     label: "Study",     icon: BookOpen },
  { href: "/generate",  label: "Generate",  icon: Sparkles },
  { href: "/decks",     label: "Decks",     icon: Layers },
  { href: "/settings",  label: "Settings",  icon: Settings },
];

export function DashboardShell({
  children,
  currentPath,
  profile,
}: {
  children: React.ReactNode;
  currentPath: string;
  profile?: Profile | null;
}) {
  const router = useRouter();
  const [dueCount, setDueCount] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) return;

    async function fetchDueCount() {
      try {
        const res = await fetch("/api/study/due-count");
        if (res.ok) {
          const data = await res.json();
          setDueCount(data.totalDue ?? 0);
        }
      } catch (err) {
        console.error("Error fetching due count:", err);
      }
    }

    fetchDueCount();
    const interval = setInterval(fetchDueCount, 2 * 60 * 1000); // Poll every 2 minutes
    return () => clearInterval(interval);
  }, [profile]);

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() ?? "U";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen flex">
      <SpaceBackground />
      <div className="relative z-10 flex flex-1 min-w-0">
        <aside className="hidden md:flex w-64 flex-col border-r bg-card/85 backdrop-blur-sm">
        <div className="h-16 flex items-center px-6 border-b">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold">
            <Sparkles className="h-5 w-5 text-primary" />
            Flashtar
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                currentPath.startsWith(item.href)
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
              {item.href === "/study" && dueCount !== null && dueCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                  {dueCount}
                </span>
              )}
            </Link>
          ))}
          {profile?.is_admin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                currentPath.startsWith("/admin")
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b flex items-center justify-between px-4 md:px-6">
          <div className="md:hidden">
            <Link href="/dashboard" className="flex items-center gap-2 font-bold">
              <Sparkles className="h-5 w-5 text-primary" />
              Flashtar
            </Link>
          </div>
          <nav className="flex md:hidden gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs whitespace-nowrap flex items-center gap-1.5",
                  currentPath.startsWith(item.href) ? "bg-primary/10 text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
                {item.href === "/study" && dueCount !== null && dueCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {dueCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt={profile?.full_name ?? ""} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{profile?.full_name ?? "User"}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
      </div>
    </div>
  );
}
