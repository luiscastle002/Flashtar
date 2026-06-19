"use client";

import * as React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDay } from "@/actions/stats";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StudyCalendarProps {
  data: CalendarDay[];
}

export function StudyCalendar({ data }: StudyCalendarProps) {
  const t = useTranslations("stats");
  const format = useFormatter();

  const [yearOffset, setYearOffset] = React.useState(0);
  const [tooltip, setTooltip] = React.useState<{
    x: number;
    y: number;
    content: string;
    visible: boolean;
  }>({ x: 0, y: 0, content: "", visible: false });

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
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Position tooltip above the cell
    const x = rect.left + window.scrollX - 70 + rect.width / 2;
    const y = rect.top + window.scrollY - 38;

    const formattedDate = format.dateTime(dateObj, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    setTooltip({
      x,
      y,
      content: t("heatmap_tooltip", { count, date: formattedDate }),
      visible: true,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

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
            {yearOffset === 0 ? "Past Year" : `${yearOffset} Year(s) Ago`}
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
        {/* Scroll Container for Mobile Viewports */}
        <div className="w-full overflow-x-auto scrollbar-none pb-2 pt-1 select-none">
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
        {tooltip.visible && (
          <div
            style={{ left: tooltip.x, top: tooltip.y }}
            className="absolute z-50 bg-popover text-popover-foreground border text-xs px-2 py-1 rounded shadow-lg transition-opacity duration-150 pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
          >
            {tooltip.content}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
