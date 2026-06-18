"use client";

import React, { useState, useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";

interface RelativeTimeFormatterProps {
  date: string;
}

export function RelativeTimeFormatter({ date }: RelativeTimeFormatterProps) {
  const [mounted, setMounted] = useState(false);
  const format = useFormatter();
  const t = useTranslations("study.deck_view");

  useEffect(() => {
    setMounted(true);
  }, []);

  const dateObj = new Date(date);

  // SSR / Hydration-safe fallback: render absolute formatted date
  if (!mounted) {
    return (
      <span>
        {t("last_studied_at", {
          time: format.dateTime(dateObj, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        })}
      </span>
    );
  }

  // Client-side render: relative time
  try {
    const relativeTimeStr = format.relativeTime(dateObj);
    return (
      <span>
        {t("last_studied_at", { time: relativeTimeStr })}
      </span>
    );
  } catch {
    // Fallback if relative formatting fails
    return (
      <span>
        {t("last_studied_at", {
          time: format.dateTime(dateObj, {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        })}
      </span>
    );
  }
}
