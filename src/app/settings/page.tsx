import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";
import { getCurrentUser, getProfile, getSubscription } from "@/lib/queries/user";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(user.id),
  ]);

  return (
    <DashboardShell currentPath="/settings" profile={profile}>
      <SettingsClient profile={profile} subscription={subscription} />
    </DashboardShell>
  );
}
