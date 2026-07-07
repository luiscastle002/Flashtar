import React from "react";
import jp from "flag-icons/flags/4x3/jp.svg";
import gb from "flag-icons/flags/4x3/gb.svg";
import es from "flag-icons/flags/4x3/es.svg";
import br from "flag-icons/flags/4x3/br.svg";
import us from "flag-icons/flags/4x3/us.svg";
import cnFlag from "flag-icons/flags/4x3/cn.svg";
import kr from "flag-icons/flags/4x3/kr.svg";
import fr from "flag-icons/flags/4x3/fr.svg";
import de from "flag-icons/flags/4x3/de.svg";
import it from "flag-icons/flags/4x3/it.svg";
import ru from "flag-icons/flags/4x3/ru.svg";
import { cn } from "@/lib/utils";

// Map various input formats to the statically imported SVGs
const FLAG_MAP: Record<string, string | { src: string }> = {
  // Categories / Languages
  japanese: jp,
  english: gb,
  spanish: es,
  portuguese: br,
  chinese: cnFlag,
  korean: kr,
  french: fr,
  german: de,
  italian: it,
  russian: ru,
  
  // Locales
  ja: jp,
  en: gb,
  es: es,
  pt: br,
  zh: cnFlag,
  ko: kr,
  fr: fr,
  de: de,
  it: it,
  ru: ru,
  cn: cnFlag,
  kr: kr,
  
  // Unicode Emojis
  "🇯🇵": jp,
  "🇬🇧": gb,
  "🇪🇸": es,
  "🇧🇷": br,
  "🇺🇸": us,
  "🇨🇳": cnFlag,
  "🇰🇷": kr,
  "🇫🇷": fr,
  "🇩🇪": de,
  "🇮🇹": it,
  "🇷🇺": ru,
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
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={srcUrl}
      alt={alt}
      className={cn("inline-block shrink-0 object-cover aspect-4/3 rounded-xs border border-border/10", className)}
      {...props}
    />
  );
}
