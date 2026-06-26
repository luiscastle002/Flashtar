import { cookies } from "next/headers";
import type { Profile } from "@/types";
import { DashboardShellClient } from "./dashboard-shell-client";
import { getSubscription } from "@/lib/queries/user";

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

  let subscription = null;
  if (profile) {
    try {
      subscription = await getSubscription(profile.id);
    } catch (err) {
      console.error("Error fetching subscription in DashboardShell:", err);
    }
  }

  return (
    <DashboardShellClient
      currentPath={currentPath}
      profile={profile}
      subscription={subscription}
      defaultCollapsed={defaultCollapsed}
    >
      {children}
    </DashboardShellClient>
  );
}
