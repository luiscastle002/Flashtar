"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FutureDueBucket } from "@/actions/stats";

interface FutureDueChartProps {
  data: FutureDueBucket[];
}

export function FutureDueChart({ data }: FutureDueChartProps) {
  const t = useTranslations("stats");

  const [tooltip, setTooltip] = React.useState<{
    x: number;
    y: number;
    content: string;
    visible: boolean;
  }>({ x: 0, y: 0, content: "", visible: false });

  // Calculate coordinates and dimensions
  const chartHeight = 180;
  const chartWidth = 440;
  const paddingLeft = 40;
  const paddingBottom = 40;
  const paddingTop = 20;

  const maxCount = React.useMemo(() => {
    const counts = data.map((d) => d.count);
    return Math.max(...counts, 5); // Fallback to 5 to avoid division by zero / tiny scale
  }, [data]);

  const barWidth = 32;
  const totalBarCount = data.length;
  
  // Calculate gap between bars
  const gap = (chartWidth - totalBarCount * barWidth) / (totalBarCount + 1);

  const handleMouseEnter = (
    e: React.MouseEvent<SVGRectElement>,
    count: number,
    label: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + window.scrollX - 60 + rect.width / 2;
    const y = rect.top + window.scrollY - 38;

    setTooltip({
      x,
      y,
      content: `${count} ${t("future_due_tooltip", { count })} (${label})`,
      visible: true,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  return (
    <Card className="bg-background/40 backdrop-blur-md border-muted/30 relative">
      <CardHeader>
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          {t("future_due")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full relative select-none">
          {/* Responsive SVG viewBox */}
          <svg
            viewBox={`0 0 ${chartWidth + paddingLeft + 20} ${chartHeight + paddingTop + paddingBottom}`}
            className="w-full h-auto overflow-visible"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = paddingTop + chartHeight - ratio * chartHeight;
              const val = Math.round(ratio * maxCount);
              return (
                <g key={i} className="opacity-40">
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={paddingLeft + chartWidth}
                    y2={y}
                    className="stroke-muted/40 stroke-1 stroke-dasharray-[2,2]"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="text-[9px] fill-muted-foreground font-medium tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Bars and labels */}
            {data.map((item, idx) => {
              const barHeight = (item.count / maxCount) * chartHeight;
              const x = paddingLeft + gap + idx * (barWidth + gap);
              const y = paddingTop + chartHeight - barHeight;
              const label = t(`due_buckets.${item.bucket}`);

              return (
                <g key={idx}>
                  {/* Bar Background (for full height hover zone) */}
                  <rect
                    x={x - gap / 4}
                    y={paddingTop}
                    width={barWidth + gap / 2}
                    height={chartHeight}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={(e) => handleMouseEnter(e, item.count, label)}
                    onMouseLeave={handleMouseLeave}
                  />

                  {/* Visual Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 2)} // Guarantee a sliver of height for visibility if count is 0
                    rx={3}
                    className={`transition-all duration-300 cursor-pointer ${
                      item.count > 0
                        ? "fill-primary/80 hover:fill-primary"
                        : "fill-muted/20 hover:fill-muted/30"
                    }`}
                    onMouseEnter={(e) => handleMouseEnter(e, item.count, label)}
                    onMouseLeave={handleMouseLeave}
                  />

                  {/* X Axis Label */}
                  <text
                    x={x + barWidth / 2}
                    y={paddingTop + chartHeight + 16}
                    textAnchor="middle"
                    className="text-[10px] fill-muted-foreground font-medium rotate-[-25deg] md:rotate-0 origin-center"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Bottom Border */}
            <line
              x1={paddingLeft}
              y1={paddingTop + chartHeight}
              x2={paddingLeft + chartWidth}
              y2={paddingTop + chartHeight}
              className="stroke-muted/50 stroke-1"
            />
          </svg>
        </div>

        {/* Dynamic Tooltip */}
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
