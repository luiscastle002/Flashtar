"use client";

import * as React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDay } from "@/actions/stats";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsTooltip } from "@/components/stats/stats-tooltip";

interface StudyCalendarProps {
  data: CalendarDay[];
}

export function StudyCalendar({ data }: StudyCalendarProps) {
  const t = useTranslations("stats");
  const format = useFormatter();

  const [yearOffset, setYearOffset] = React.useState(0);
  const [tooltip, setTooltip] = React.useState<{
    targetElement: Element | null;
    content: React.ReactNode;
    visible: boolean;
  }>({ targetElement: null, content: "", visible: false });

  // Scroll Container Ref
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Scroll State to manage navigation chevrons visibility
  const [scrollState, setScrollState] = React.useState({
    canScrollLeft: false,
    canScrollRight: false,
    isOverflowing: false,
  });

  // Map dates for quick lookups
  const countMap = React.useMemo(() => {
    const map = new Map<string, CalendarDay>();
    data.forEach((day) => {
      map.set(day.date, day);
    });
    return map;
  }, [data]);

  // Generate grid days for the selected year range
  const { weeks, monthLabels } = React.useMemo(() => {
    const end = new Date();
    // Shift end date if looking at previous years
    end.setFullYear(end.getFullYear() - yearOffset);
    
    // We display 365 days (53 weeks) ending at the computed date
    const start = new Date(end);
    start.setDate(start.getDate() - 364);

    // Align start to the nearest preceding Sunday
    const startDay = start.getDay();
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - startDay);

    const daysList: { dateStr: string; dateObj: Date; count: number; timeMs: number }[] = [];
    const tempDate = new Date(gridStart);

    // Generate exactly 53 weeks (371 days) to make a perfect grid
    for (let i = 0; i < 371; i++) {
      const dateStr = tempDate.toISOString().split("T")[0];
      const stats = countMap.get(dateStr);
      daysList.push({
        dateStr,
        dateObj: new Date(tempDate),
        count: stats?.count ?? 0,
        timeMs: stats?.timeMs ?? 0,
      });
      tempDate.setDate(tempDate.getDate() + 1);
    }

    // Partition into 53 weeks of 7 days
    const weeksList: typeof daysList[] = [];
    for (let i = 0; i < 53; i++) {
      weeksList.push(daysList.slice(i * 7, (i + 1) * 7));
    }

    // Calculate month label column offsets
    const labels: { text: string; colIndex: number }[] = [];
    let lastMonth = -1;
    weeksList.forEach((week, colIndex) => {
      const firstDayOfWeek = week[0].dateObj;
      const month = firstDayOfWeek.getMonth();
      if (month !== lastMonth) {
        labels.push({
          text: format.dateTime(firstDayOfWeek, { month: "short" }),
          colIndex,
        });
        lastMonth = month;
      }
    });

    return { weeks: weeksList, monthLabels: labels };
  }, [countMap, yearOffset, format]);

  const rectSize = 10;
  const rectGap = 3;
  const labelHeight = 16;
  const labelWidth = 28;

  // Grid SVG dimensions
  const gridWidth = 53 * (rectSize + rectGap) + labelWidth;
  const gridHeight = 7 * (rectSize + rectGap) + labelHeight + 4;

  const getIntensityClass = (count: number) => {
    if (count === 0) return "fill-muted/20 hover:fill-muted/30 dark:fill-muted/10 dark:hover:fill-muted/20";
    if (count <= 10) return "fill-primary/20 hover:fill-primary/30";
    if (count <= 30) return "fill-primary/50 hover:fill-primary/60";
    if (count <= 60) return "fill-primary/80 hover:fill-primary/90";
    return "fill-primary";
  };

  const handleMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    dateObj: Date,
    count: number
  ) => {
    const formattedDate = format.dateTime(dateObj, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    setTooltip({
      targetElement: e.currentTarget,
      content: t("heatmap_tooltip", { count, date: formattedDate }),
      visible: true,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  // Check scroll positions and scrollability
  const checkScroll = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const isOverflowing = scrollWidth > clientWidth;
    const canScrollLeft = scrollLeft > 1;
    const canScrollRight = scrollLeft < scrollWidth - clientWidth - 1;

    setScrollState({
      canScrollLeft,
      canScrollRight,
      isOverflowing,
    });
  }, []);

  // Handle smooth scroll clicks
  const handleScroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;

    const scrollAmount = el.clientWidth * 0.6;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // Scroll to far right on mount and whenever weeks/yearOffset changes
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Scroll to the end (latest activity is on the right)
    el.scrollLeft = el.scrollWidth;
    checkScroll();

    // Setup ResizeObserver for responsive width checking
    const observer = new ResizeObserver(() => {
      checkScroll();
    });
    observer.observe(el);

    // Setup scroll event listener
    el.addEventListener("scroll", checkScroll, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", checkScroll);
    };
  }, [weeks, checkScroll]);

  return (
    <Card className="bg-background/40 backdrop-blur-md border-muted/30 relative">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          {t("study_calendar")}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setYearOffset((prev) => prev + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium tabular-nums min-w-[70px] text-center">
            {yearOffset === 0 ? t("past_year") : t("years_ago", { count: yearOffset })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={yearOffset === 0}
            onClick={() => setYearOffset((prev) => Math.max(0, prev - 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Scroll Wrapper to position navigation buttons absolutely */}
        <div className="relative group/calendar">
          {/* Scroll Container */}
          <div
            ref={containerRef}
            className="w-full overflow-x-auto scrollbar-none pb-2 pt-1 select-none outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
            tabIndex={0}
            aria-label={t("study_calendar")}
          >
            <svg
              width={gridWidth}
              height={gridHeight}
              className="overflow-visible mx-auto"
            >
              {/* Month Labels */}
              {monthLabels.map((label, i) => (
                <text
                  key={i}
                  x={labelWidth + label.colIndex * (rectSize + rectGap)}
                  y={labelHeight - 4}
                  className="text-[9px] fill-muted-foreground font-medium"
                >
                  {label.text}
                </text>
              ))}

              {/* Weekday Labels */}
              {["M", "W", "F"].map((label, idx) => (
                <text
                  key={idx}
                  x={0}
                  y={labelHeight + (idx * 2 + 1) * (rectSize + rectGap) + 8}
                  className="text-[9px] fill-muted-foreground font-medium"
                >
                  {label}
                </text>
              ))}

              {/* Heatmap Rectangles */}
              {weeks.map((week, colIdx) => (
                <g
                  key={colIdx}
                  transform={`translate(${labelWidth + colIdx * (rectSize + rectGap)}, ${labelHeight})`}
                >
                  {week.map((day, rowIdx) => (
                    <rect
                      key={rowIdx}
                      y={rowIdx * (rectSize + rectGap)}
                      width={rectSize}
                      height={rectSize}
                      rx={1.5}
                      className={`transition-colors duration-150 cursor-pointer outline-none ${getIntensityClass(
                        day.count
                      )}`}
                      onMouseEnter={(e) => handleMouseEnter(e, day.dateObj, day.count)}
                      onMouseLeave={handleMouseLeave}
                    />
                  ))}
                </g>
              ))}
            </svg>
          </div>

          {/* Left Navigation Overlay/Button */}
          {scrollState.isOverflowing && scrollState.canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-2 w-16 bg-gradient-to-r from-background via-background/60 to-transparent flex items-center justify-start pl-1 pointer-events-none">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full shadow-sm border-muted/50 pointer-events-auto bg-background/90 backdrop-blur-sm transition-opacity duration-200"
                onClick={() => handleScroll("left")}
                aria-label={t("scroll_left")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Right Navigation Overlay/Button */}
          {scrollState.isOverflowing && scrollState.canScrollRight && (
            <div className="absolute right-0 top-0 bottom-2 w-16 bg-gradient-to-l from-background via-background/60 to-transparent flex items-center justify-end pr-1 pointer-events-none">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full shadow-sm border-muted/50 pointer-events-auto bg-background/90 backdrop-blur-sm transition-opacity duration-200"
                onClick={() => handleScroll("right")}
                aria-label={t("scroll_right")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          <div className="w-2.5 h-2.5 rounded-[1.5px] bg-muted/20 dark:bg-muted/10" />
          <div className="w-2.5 h-2.5 rounded-[1.5px] bg-primary/20" />
          <div className="w-2.5 h-2.5 rounded-[1.5px] bg-primary/50" />
          <div className="w-2.5 h-2.5 rounded-[1.5px] bg-primary/80" />
          <div className="w-2.5 h-2.5 rounded-[1.5px] bg-primary" />
          <span>More</span>
        </div>

        {/* Dynamic Client Floating Tooltip */}
        <StatsTooltip
          targetElement={tooltip.targetElement}
          visible={tooltip.visible}
          content={tooltip.content}
        />
      </CardContent>
    </Card>
  );
}
