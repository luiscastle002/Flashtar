import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/settings-client";
import { getCurrentUser, getProfile, getSubscription } from "@/lib/queries/user";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(user.id),
  ]);

  return <SettingsClient profile={profile} subscription={subscription} />;
}
