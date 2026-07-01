import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getCoursesCategories } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export async function generateMetadata() {
  const t = await getTranslations("courses");
  return {
    title: `${t("title")} — Flashtar`,
    description: "Learn built-in curricula with structured courses.",
  };
}

export default async function CoursesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, categories, t] = await Promise.all([
    getProfile(),
    getCoursesCategories(),
    getTranslations("courses"),
  ]);

  return (
    <DashboardShell currentPath="/study/courses" profile={profile}>
      <div className="space-y-8 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display uppercase tracking-wider flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-display uppercase tracking-wider font-semibold">
            Official structured paths designed to help you master new subjects
          </p>
        </div>

        {/* Categories Catalog */}
        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No categories available at this time.
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {categories.map((cat) => {
              // Extract raw key: strip qualified prefix if DB still has old values (e.g. "courses.categories.japanese" → "japanese")
              const rawCatKey = cat.name_key.split(".").pop() ?? cat.name_key;
              const catEmoji = t(`categories.${rawCatKey}.emoji` as Parameters<typeof t>[0], { defaultValue: "📚" });
              const catName = t(`categories.${rawCatKey}.name` as Parameters<typeof t>[0], { defaultValue: rawCatKey });
              const catDesc = t(`categories.${rawCatKey}.desc` as Parameters<typeof t>[0], { defaultValue: "" });

              return (
                <Card
                  key={cat.id}
                  className="relative overflow-hidden group hover:border-primary/40 transition-all duration-300 flex flex-col bg-card/60 backdrop-blur-sm shadow-md"
                >
                  <CardHeader className="pb-4 pl-6">
                    <div className="flex justify-between items-start">
                      <span className="text-4xl" role="img" aria-label="Category emoji">
                        {catEmoji}
                      </span>
                    </div>

                    <CardTitle className="text-2xl font-bold font-display uppercase tracking-wide mt-4 group-hover:text-primary transition-colors flex items-center gap-2">
                      {catName}
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground/80 mt-1 min-h-[40px]">
                      {catDesc}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0 pl-6 flex-1 flex flex-col justify-end">
                    <div className="space-y-4 border-t pt-4 mt-auto">
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
                        <span>{cat.deckCount} Courses</span>
                        {cat.enrolledCount > 0 && (
                          <span className="text-emerald-500">{cat.enrolledCount} Enrolled</span>
                        )}
                      </div>

                      {cat.enrolledCount > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] uppercase font-semibold text-muted-foreground tracking-wider font-display">
                            <span>Syllabus Completion</span>
                            <span>{cat.progressPct}%</span>
                          </div>
                          <Progress value={cat.progressPct} className="h-1.5" />
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <Button size="sm" className="group rounded-xl" asChild>
                          <Link href={`/study/courses/category/${cat.id}`}>
                            Open <ArrowRight className="ml-1.5 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
