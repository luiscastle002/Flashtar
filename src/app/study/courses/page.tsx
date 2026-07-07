import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { GraduationCap, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getCoursesCategories } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CountryFlag } from "@/components/shared/country-flag";


export async function generateMetadata() {
  const t = await getTranslations("courses");
  return {
    title: `${t("title")} — Flashtar`,
    description: "Learn built-in curricula with structured courses.",
  };
}

const CATEGORY_BANNERS: Record<string, string> = {
  japanese: "/images/jp_banner_course.png",
  english: "/images/us_banner_course.png",
  spanish: "/images/es_banner_course.png",
};

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
      <div className="space-y-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold font-display tracking-tight flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Official structured paths designed to help you master new subjects
          </p>
        </div>

        {/* Categories Catalog */}
        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {t("no_categories")}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => {
              // Extract raw key: strip qualified prefix if DB still has old values (e.g. "courses.categories.japanese" → "japanese")
              const rawCatKey = cat.name_key.split(".").pop() ?? cat.name_key;
              const catEmoji = t(`categories.${rawCatKey}.emoji` as Parameters<typeof t>[0], { defaultValue: "📚" });
              const catName = t(`categories.${rawCatKey}.name` as Parameters<typeof t>[0], { defaultValue: rawCatKey });
              const catDesc = t(`categories.${rawCatKey}.desc` as Parameters<typeof t>[0], { defaultValue: "" });
              const bannerUrl = CATEGORY_BANNERS[rawCatKey];

              return (
                <div
                  key={cat.id}
                  className="relative overflow-hidden group rounded-xl border border-zinc-800 bg-zinc-950/40 hover:border-primary/40 transition-all duration-300 flex flex-col md:flex-row items-stretch shadow-md hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.6)] min-h-[220px]"
                >
                  {/* Background Artwork */}
                  {bannerUrl ? (
                    <div className="absolute inset-0 z-0 overflow-hidden w-full h-full">
                      <Image
                        src={bannerUrl}
                        alt={catName}
                        fill
                        sizes="(max-w-768px) 100vw, (max-w-1280px) 100vw, 1280px"
                        priority={cat.position === 0}
                        className="object-cover object-center w-full h-full transition-all duration-500 group-hover:scale-[1.03] group-hover:brightness-110 group-hover:saturate-[1.15]"
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 z-0 bg-gradient-to-br from-zinc-900 via-indigo-950 to-zinc-950 transition-all duration-500 group-hover:brightness-110" />
                  )}

                  {/* Layered Progressive Overlays */}
                  {/* Base tint for contrast */}
                  <div className="absolute inset-0 bg-background/60 md:bg-background/25 z-10 transition-colors duration-300 group-hover:bg-background/55 md:group-hover:bg-background/15" />

                  {/* Fade Gradient: mobile vertical, desktop horizontal */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent md:bg-gradient-to-r md:from-transparent md:via-background/50 md:to-background z-10" />

                  {/* Content Container */}
                  <div className="relative z-20 w-full flex flex-col md:flex-row items-stretch justify-between p-6 md:p-8 min-h-[220px] gap-6">
                    {/* Left Spacer - leaves space for the visible artwork on desktop */}
                    <div className="hidden md:block md:w-1/3 lg:w-1/2 pointer-events-none" />

                    {/* Content Section */}
                    <div className="w-full md:w-2/3 lg:w-1/2 flex flex-col justify-between text-left md:text-right space-y-4 md:space-y-6">
                      {/* Identity & Description */}
                      <div className="space-y-2">
                        <h2 className="text-2xl md:text-3xl font-semibold font-display tracking-tight text-foreground group-hover:text-primary transition-colors flex items-center justify-start md:justify-end gap-3">
                          {catName}
                          <CountryFlag value={rawCatKey} className="h-5 w-6.5 shadow-sm rounded-sm" alt={catName} />

                        </h2>
                        <p className="text-sm text-muted-foreground/90 max-w-md mr-auto md:ml-auto leading-relaxed">
                          {catDesc}
                        </p>
                      </div>

                      {/* Stats & CTA Action */}
                      <div className="flex flex-wrap items-center justify-start md:justify-end gap-4 md:gap-6 pt-4 border-t border-zinc-800/60 mt-auto">
                        {/* Course Count */}
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
                          {t("course_count_plural", { count: cat.deckCount })}
                        </span>

                        {/* Completion Tracker */}
                        {cat.enrolledCount > 0 && (
                          <div className="flex flex-col items-start md:items-end gap-1.5 min-w-[120px]">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 uppercase tracking-wider font-display">
                              {t("progress_complete", { percent: cat.progressPct })}
                            </div>
                            <Progress value={cat.progressPct} className="h-1.5 w-28 bg-zinc-800" />
                          </div>
                        )}

                        {/* Action Button */}
                        <Button size="default" className="group rounded-xl font-semibold px-5" asChild>
                          <Link href={`/study/courses/category/${cat.id}`}>
                            {t("open")}
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
