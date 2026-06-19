import { BarChart3, Flame, Clock, Brain } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { StreakStats, SummaryStats } from "@/actions/stats";
import { formatStatTime } from "@/lib/utils/stats-format";

interface StatsHeaderProps {
  summary: SummaryStats;
  streak: StreakStats;
  deckName?: string | null;
}

export async function StatsHeader({ summary, streak, deckName }: StatsHeaderProps) {
  const t = await getTranslations("stats");

  const timeString = formatStatTime(summary.totalTimeMs);

  return (
    <div className="space-y-6">
      {/* Scope Title */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-primary" />
          {deckName ? deckName : t("global_stats")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("title")}</p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Studied */}
        <Card className="bg-background/40 backdrop-blur-md border-muted/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("total_studied")}</p>
              <h3 className="text-lg md:text-xl font-bold mt-0.5 tabular-nums">
                {summary.totalStudied}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Study Time */}
        <Card className="bg-background/40 backdrop-blur-md border-muted/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-green-500/10 text-green-500 shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("total_time")}</p>
              <h3 className="text-lg md:text-xl font-bold mt-0.5 tabular-nums">
                {timeString}
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Retention */}
        <Card className="bg-background/40 backdrop-blur-md border-muted/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 shrink-0">
              <Brain className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("retention")}</p>
              <h3 className="text-lg md:text-xl font-bold mt-0.5 tabular-nums">
                {summary.averageRetention}%
              </h3>
            </div>
          </CardContent>
        </Card>

        {/* Streak */}
        <Card className="bg-background/40 backdrop-blur-md border-muted/30">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-500 shrink-0">
              <Flame className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("streaks")}</p>
              <h3 className="text-lg md:text-xl font-bold mt-0.5 tabular-nums">
                {t("streak_days", { count: streak.currentStreak })}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {t("longest_streak")}: {t("streak_days", { count: streak.longestStreak })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
