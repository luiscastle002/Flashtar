import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { SpaceBackgroundProvider } from "@/components/shared/space-background-context";
import { SpaceBackgroundCanvas } from "@/components/shared/space-background-canvas";
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased relative min-h-screen`}>
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
      </body>
    </html>
  );
}
