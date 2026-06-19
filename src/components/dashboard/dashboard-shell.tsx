import { cookies } from "next/headers";
import type { Profile } from "@/types";
import { DashboardShellClient } from "./dashboard-shell-client";

export async function DashboardShell({
  children,
  currentPath,
  profile,
}: {
  children: React.ReactNode;
  currentPath: string;
  profile?: Profile | null;
}) {
  const cookieStore = await cookies();
  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return (
    <DashboardShellClient
      currentPath={currentPath}
      profile={profile}
      defaultCollapsed={defaultCollapsed}
    >
      {children}
    </DashboardShellClient>
  );
}
