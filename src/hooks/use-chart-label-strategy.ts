"use client";

import * as React from "react";

interface UseChartLabelStrategyOptions {
  threshold?: number;
}

export function useChartLabelStrategy({ threshold = 480 }: UseChartLabelStrategyOptions = {}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isNarrow, setIsNarrow] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initial check
    setIsNarrow(el.clientWidth < threshold);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setIsNarrow(entries[0].contentRect.width < threshold);
      }
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold]);

  return { containerRef, isNarrow };
}
