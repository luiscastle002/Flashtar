"use client";

import React, { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateDeckSettings } from "@/actions/study-decks";
import { toast } from "sonner";

interface ToggleAutoAudioButtonProps {
  deckId: string;
  autoplayAudioFront: boolean;
  autoplayAudioBack: boolean;
}

export function ToggleAutoAudioButton({
  deckId,
  autoplayAudioFront,
  autoplayAudioBack,
}: ToggleAutoAudioButtonProps) {
  const t = useTranslations("study.deck_view");
  const [isPending, startTransition] = useTransition();

  const currentEnabled = autoplayAudioFront && autoplayAudioBack;

  const handleToggle = () => {
    startTransition(async () => {
      const res = await updateDeckSettings(deckId, {
        autoplay_audio_front: !currentEnabled,
        autoplay_audio_back: !currentEnabled,
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
      className={`gap-1.5 transition-colors ${
        currentEnabled
          ? "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary"
          : ""
      }`}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : currentEnabled ? (
        <Volume2 className="h-4 w-4" />
      ) : (
        <VolumeX className="h-4 w-4" />
      )}
      {currentEnabled ? t("auto_audio_on") : t("auto_audio_off")}
    </Button>
  );
}
