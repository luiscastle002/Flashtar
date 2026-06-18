import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import { getCurrentUser, getProfile } from "@/lib/queries/user";
import { getStudyDeckWithSettings } from "@/actions/study-decks";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DeckSettingsForm } from "@/components/study/deck-settings-form";
import type { DeckStudySettings } from "@/types";
import { getDeckIconUrl } from "@/lib/utils/image";
import { getTranslations } from "next-intl/server";

interface SettingsPageProps {
  params: Promise<{ deckId: string }>;
}

export async function generateMetadata() {
  const t = await getTranslations("study.settings");
  return {
    title: `${t("title")} — Flashtar`,
  };
}

export default async function DeckSettingsPage({ params }: SettingsPageProps) {
  const { deckId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, deckData, t] = await Promise.all([
    getProfile(),
    getStudyDeckWithSettings(deckId),
    getTranslations("study.settings"),
  ]);

  if (!deckData) notFound();

  const deck = deckData as typeof deckData & {
    name: string;
    description: string | null;
    emoji: string | null;
    color: string;
    icon_type: "emoji" | "image";
    custom_icon_path: string | null;
    is_archived: boolean;
    deck_study_settings: DeckStudySettings | null;
  };

  const customIconUrl = getDeckIconUrl(deck.custom_icon_path);

  return (
    <DashboardShell currentPath="/study" profile={profile}>
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <div className="flex items-center gap-2 mt-1">
            {deck.icon_type === "image" && customIconUrl ? (
              <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden border">
                <Image src={customIconUrl} alt={deck.name} fill className="object-cover" />
              </span>
            ) : (
              <span className="text-lg">{deck.emoji ?? "📚"}</span>
            )}
            <p className="text-sm text-muted-foreground font-medium">
              {deck.name}
            </p>
          </div>
        </div>
        <DeckSettingsForm
          deckId={deckId}
          settings={deck.deck_study_settings}
          isArchived={deck.is_archived}
          deckName={deck.name}
          deckDescription={deck.description}
          deckEmoji={deck.emoji}
          deckColor={deck.color}
          iconType={deck.icon_type}
          customIconPath={deck.custom_icon_path}
        />
      </div>
    </DashboardShell>
  );
}
