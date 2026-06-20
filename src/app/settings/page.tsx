import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";
import { 
  getCurrentUser, 
  getProfile, 
  getSubscription,
  getGoogleDriveConnection,
  getOrCreateAudioUsage,
  getAudioUsageHistory,
  hasQuotaExceededJobs
} from "@/lib/queries/user";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, subscription, googleConnection, audioUsage, audioHistory, hasQuotaExceeded] = await Promise.all([
    getProfile(),
    getSubscription(user.id),
    getGoogleDriveConnection(user.id),
    getOrCreateAudioUsage(user.id),
    getAudioUsageHistory(user.id),
    hasQuotaExceededJobs(user.id),
  ]);

  return (
    <DashboardShell currentPath="/settings" profile={profile}>
      <SettingsClient 
        profile={profile} 
        subscription={subscription} 
        googleConnection={googleConnection ?? null}
        audioUsage={audioUsage ?? null}
        audioHistory={audioHistory ?? []}
        hasQuotaExceeded={hasQuotaExceeded}
      />
    </DashboardShell>
  );
}

