"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Globe, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updatePreferredLanguage } from "@/actions/profile";
import type { Locale } from "@/lib/i18n/config";
import { CountryFlag } from "@/components/shared/country-flag";


const languages = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
] as const;

export function LanguageSelector() {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();

  const currentLanguage = languages.find((lang) => lang.code === locale) || languages[0];

  const handleSelect = async (langCode: Locale) => {
    // 1. Set the cookie NEXT_LOCALE with 1 year expiration
    document.cookie = `NEXT_LOCALE=${langCode}; path=/; max-age=31536000; SameSite=Lax`;

    // 2. Update database preferred language (will fail silently with "Not authenticated" if guest)
    try {
      const res = await updatePreferredLanguage(langCode);
      if (res && "error" in res && res.error && res.error !== "Not authenticated") {
        console.error("Failed to update preferred language in database:", res.error);
      }
    } catch (err) {
      console.error("Failed to execute database language update:", err);
    }

    // 3. Refresh the current route to fetch the new translations from the server
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2 text-muted-foreground hover:text-foreground focus:outline-none"
          aria-label={t("select")}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium">{currentLanguage.name}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[140px] bg-popover/95 backdrop-blur-sm">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className="cursor-pointer flex items-center justify-between text-xs py-2"
          >
            <span className={locale === lang.code ? "font-semibold text-primary" : ""}>
              {lang.name}
            </span>
            <CountryFlag value={lang.code} className="h-3.5 w-5 rounded-xs" alt={lang.name} />

          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
