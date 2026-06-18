"use client";

import React, { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateDeckSettings } from "@/actions/study-decks";
import { toast } from "sonner";

interface ToggleCardVisibilityButtonProps {
  deckId: string;
  currentVisible: boolean;
}

export function ToggleCardVisibilityButton({
  deckId,
  currentVisible,
}: ToggleCardVisibilityButtonProps) {
  const t = useTranslations("study.deck_view");
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      const res = await updateDeckSettings(deckId, {
        show_card_preview: !currentVisible,
      });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
      }
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={isPending}
      className="gap-1.5"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : currentVisible ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
      {currentVisible ? t("hide_cards") : t("show_cards")}
    </Button>
  );
}
