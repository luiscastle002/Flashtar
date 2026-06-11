import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/admin";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.is_admin) redirect("/dashboard");

  const supabase = createServiceClient();

  const [
    { count: userCount },
    { count: deckCount },
    { count: generationCount },
    { data: subscriptions },
    { data: recentGenerations },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("decks").select("id", { count: "exact", head: true }),
    supabase.from("ai_generations").select("id", { count: "exact", head: true }),
    supabase.from("subscriptions").select("*").order("created_at", { ascending: false }).limit(10),
    supabase
      .from("ai_generations")
      .select("*, profiles(email)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const proCount = subscriptions?.filter((s) => s.plan === "pro" && s.status === "active").length ?? 0;

  return (
    <DashboardShell currentPath="/admin" profile={profile}>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground">Platform overview and management</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <p className="text-3xl font-bold">{userCount ?? 0}</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Decks</CardTitle>
              <p className="text-3xl font-bold">{deckCount ?? 0}</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Generations</CardTitle>
              <p className="text-3xl font-bold">{generationCount ?? 0}</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Pro Users</CardTitle>
              <p className="text-3xl font-bold">{proCount}</p>
            </CardHeader>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(subscriptions ?? []).map((sub) => (
                  <div key={sub.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                    <span className="capitalize">{sub.plan}</span>
                    <span className="text-muted-foreground capitalize">{sub.status}</span>
                  </div>
                ))}
                {!subscriptions?.length && (
                  <p className="text-sm text-muted-foreground">No subscriptions yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent AI Generations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(recentGenerations ?? []).map((gen) => (
                  <div key={gen.id} className="text-sm border-b pb-2 last:border-0">
                    <p className="line-clamp-1 font-medium">{gen.prompt}</p>
                    <p className="text-xs text-muted-foreground">
                      {(gen.profiles as { email: string } | null)?.email} · {gen.card_count} cards ·{" "}
                      {formatDate(gen.created_at)}
                    </p>
                  </div>
                ))}
                {!recentGenerations?.length && (
                  <p className="text-sm text-muted-foreground">No generations yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
