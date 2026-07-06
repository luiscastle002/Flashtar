import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Play, CheckCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getCategoryDecks } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CourseEnrollButton } from "@/components/courses/course-enroll-button";

interface CategoryPageProps {
  params: Promise<{ categoryId: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("courses");
  return {
    title: `${t("title")} Category — Flashtar`,
  };
}

export default async function CategoryPage(props: CategoryPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { categoryId } = await props.params;

  const [profile, catData, t] = await Promise.all([
    getProfile(),
    getCategoryDecks(categoryId),
    getTranslations("courses"),
  ]);

  if (!catData) notFound();

  const { category, decks } = catData;
  // Strip qualified prefix if DB still has old values (e.g. "courses.categories.japanese" → "japanese")
  const rawCategoryKey = category.name_key.split(".").pop() ?? category.name_key;
  const categoryName = t(`categories.${rawCategoryKey}.name` as Parameters<typeof t>[0], { defaultValue: rawCategoryKey });

  return (
    <DashboardShell currentPath="/study/courses" profile={profile}>
      <div className="space-y-8 max-w-7xl mx-auto w-full">
        {/* Breadcrumb Back Navigation */}
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2 rounded-xl text-muted-foreground hover:text-foreground">
            <Link href="/study/courses">
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to Catalog
            </Link>
          </Button>

          <h1 className="text-2xl md:text-3xl font-semibold font-display tracking-tight flex items-center gap-3">
            {categoryName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a course to begin your learning path
          </p>
        </div>

        {/* Decks Grid */}
        {decks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No courses available under this category.
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck) => {
              // Strip qualified prefix if DB still has old values (e.g. "courses.decks.hiragana.name" → "hiragana")
              const rawDeckKey = deck.name_key.split(".").filter((s: string) => !['courses','decks','name'].includes(s)).join(".") || deck.name_key.split(".").pop() || deck.name_key;
              const isEnrolled = deck.enrolled;
              const dueCount = deck.due?.total_due ?? 0;

              return (
                <Card
                  key={deck.id}
                  className="relative overflow-hidden group hover:border-primary/40 transition-all duration-300 flex flex-col bg-card/60 backdrop-blur-sm shadow-md"
                >
                  {/* Decorative side accent */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 transition-all duration-300 group-hover:w-2"
                    style={{ backgroundColor: deck.color || "#6366f1" }}
                  />

                  <CardHeader className="pb-4 pl-6">
                    <div className="flex justify-between items-start">
                      <span className="text-3xl" role="img" aria-label="Deck emoji">
                        {deck.emoji || "📚"}
                      </span>
                      <div className="flex gap-2">
                        {isEnrolled ? (
                          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] font-semibold flex items-center gap-1 uppercase tracking-wider font-display">
                            <CheckCircle className="h-3 w-3" />
                            {t("actions.status.in_progress")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-display font-semibold">
                            {t("actions.status.not_started")}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wider font-display font-semibold"
                        >
                          {t(`difficulty.${deck.difficulty.toLowerCase()}` as Parameters<typeof t>[0], { defaultValue: deck.difficulty })}
                        </Badge>
                      </div>
                    </div>

                    <CardTitle className="text-xl font-semibold font-display tracking-tight mt-3 group-hover:text-primary transition-colors">
                      {t(`decks.${rawDeckKey}.name` as Parameters<typeof t>[0], { defaultValue: rawDeckKey })}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-sm text-muted-foreground/80 mt-1 min-h-[40px]">
                      {t(`decks.${rawDeckKey}.desc` as Parameters<typeof t>[0], { defaultValue: "" })}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-0 pl-6 flex-1 flex flex-col justify-end">
                    <div className="border-t pt-4 mt-auto flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
                        {deck.card_count} Cards
                      </span>

                      {isEnrolled ? (
                        <div className="flex items-center gap-3">
                          {dueCount > 0 && (
                            <Badge className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs">
                              {dueCount} Due
                            </Badge>
                          )}
                          <Button size="sm" variant="default" asChild className="rounded-xl">
                            <Link href={`/study/courses/${deck.studyDeckId}`}>
                              Study <Play className="ml-1.5 h-3.5 w-3.5 fill-current" />
                            </Link>
                          </Button>
                        </div>
                      ) : (
                        <CourseEnrollButton sharedDeckId={deck.id} />
                      )}
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
