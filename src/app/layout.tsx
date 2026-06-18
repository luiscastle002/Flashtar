import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SpaceBackgroundProvider } from "@/components/shared/space-background-context";
import { SpaceBackgroundCanvas } from "@/components/shared/space-background-canvas";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: {
    default: "Flashtar — AI-Powered Flashcard Generation",
    template: "%s | Flashtar",
  },
  description:
    "Generate complete, high-quality flashcard decks with AI. Create, edit, and study in seconds.",
  icons: {
    icon: "/flashtar.icon.png",
    apple: "/flashtar.icon.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased relative min-h-screen`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SpaceBackgroundProvider>
              <SpaceBackgroundCanvas />
              {children}
            </SpaceBackgroundProvider>
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
