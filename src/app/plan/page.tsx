import { redirect } from "next/navigation";
import { PlanClient } from "@/components/plan/plan-client";
import { 
  getCurrentUser, 
  getProfile, 
  getSubscription 
} from "@/lib/queries/user";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default async function PlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, subscription] = await Promise.all([
    getProfile(),
    getSubscription(user.id)
  ]);

  return (
    <DashboardShell currentPath="/plan" profile={profile}>
      <PlanClient subscription={subscription} />
    </DashboardShell>
  );
}
