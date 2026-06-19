import { GenerateForm } from "@/components/generate/generate-form";
import { getDashboardStats, getProfile } from "@/lib/queries/user";
import { getSavedPrompts } from "@/actions/prompts";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Plan } from "@/types";

export default async function GeneratePage() {
  const [stats, profile, prompts] = await Promise.all([
    getDashboardStats(),
    getProfile(),
    getSavedPrompts(),
  ]);

  return (
    <DashboardShell currentPath="/generate" profile={profile}>
      <GenerateForm
        plan={(stats?.plan ?? "free") as Plan}
        monthlyGenerations={stats?.monthlyGenerations ?? 0}
        profile={profile}
        initialPrompts={prompts}
      />
    </DashboardShell>
  );
}
