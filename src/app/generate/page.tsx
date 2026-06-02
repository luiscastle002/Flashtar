import { GenerateForm } from "@/components/generate/generate-form";
import { getDashboardStats, getProfile } from "@/lib/queries/user";
import type { Plan } from "@/types";

export default async function GeneratePage() {
  const [stats, profile] = await Promise.all([getDashboardStats(), getProfile()]);

  return (
    <GenerateForm
      plan={(stats?.plan ?? "free") as Plan}
      monthlyGenerations={stats?.monthlyGenerations ?? 0}
      profile={profile}
    />
  );
}
