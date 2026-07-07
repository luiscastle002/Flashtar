import React from "react";
import jp from "flag-icons/flags/4x3/jp.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import es from "flag-icons/flags/4x3/es.svg";
import br from "flag-icons/flags/4x3/br.svg";
import us from "flag-icons/flags/4x3/us.svg";
import { cn } from "@/lib/utils";

// Map various input formats to the statically imported SVGs
const FLAG_MAP: Record<string, any> = {
  // Categories
  japanese: jp,
  english: gb,
  spanish: es,
  portuguese: br,
  
  // Locales
  ja: jp,
  en: gb,
  es: es,
  pt: br,
  
  // Unicode Emojis
  "🇯🇵": jp,
  "🇬🇧": gb,
  "🇪🇸": es,
  "🇧🇷": br,
  "🇺🇸": us,
};

interface CountryFlagProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  value: string;
}

export function CountryFlag({ value, className, alt = "Flag", ...props }: CountryFlagProps) {
  const normalizedValue = value.trim().toLowerCase();
  
  // Attempt exact matching or case-sensitive emoji fallback
  const flagAsset = FLAG_MAP[normalizedValue] || FLAG_MAP[value];

  if (!flagAsset) {
    return <span className={className}>{value}</span>;
  }

  const srcUrl = typeof flagAsset === "object" && flagAsset !== null && "src" in flagAsset 
    ? flagAsset.src 
    : flagAsset;

  return (
    <img
      src={srcUrl}
      alt={alt}
      className={cn("inline-block shrink-0 object-cover aspect-4/3 rounded-xs border border-border/10", className)}
      {...props}
    />
  );
}
