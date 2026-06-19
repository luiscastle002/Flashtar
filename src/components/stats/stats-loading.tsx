import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function StatsLoading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      {/* Selector Skeleton */}
      <Skeleton className="h-10 w-full sm:max-w-xs" />

      {/* Cards Skeletons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-muted/30 bg-background/20">
            <CardContent className="p-4 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Skeletons */}
      <div className="space-y-6">
        <Card className="border-muted/30 bg-background/20">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[150px] w-full" />
          </CardContent>
        </Card>

        <Card className="border-muted/30 bg-background/20">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
