export const locales = ["en", "es", "pt", "ja"] as const;

export type Locale = typeof locales[number];

export const defaultLocale = "en";
