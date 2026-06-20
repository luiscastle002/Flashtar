import { redirect } from "next/navigation";
import { GenerateForm } from "@/components/generate/generate-form";
import { getDashboardStats, getProfile, getGoogleDriveConnection, getCurrentUser } from "@/lib/queries/user";
import { getSavedPrompts } from "@/actions/prompts";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Plan } from "@/types";

export default async function GeneratePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [stats, profile, prompts, googleConnection] = await Promise.all([
    getDashboardStats(),
    getProfile(),
    getSavedPrompts(),
    getGoogleDriveConnection(user.id),
  ]);

  return (
    <DashboardShell currentPath="/generate" profile={profile}>
      <GenerateForm
        plan={(stats?.plan ?? "free") as Plan}
        monthlyGenerations={stats?.monthlyGenerations ?? 0}
        profile={profile}
        initialPrompts={prompts}
        googleConnected={!!googleConnection && googleConnection.connection_status === "connected"}
      />
    </DashboardShell>
  );
}
