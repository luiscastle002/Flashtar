"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { BarChart3 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDeckIconUrl } from "@/lib/utils/image";

interface SelectorDeck {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  icon_type: string;
  custom_icon_path: string | null;
  card_count: number;
  due_count: number;
}

interface StatsDeckSelectorProps {
  decks: SelectorDeck[];
  selectedDeckId: string | null;
}

export function StatsDeckSelector({ decks, selectedDeckId }: StatsDeckSelectorProps) {
  const router = useRouter();
  const t = useTranslations("stats");

  const handleChange = (value: string) => {
    if (value === "global") {
      router.push("/stats");
    } else {
      router.push(`/stats/${value}`);
    }
  };

  const currentValue = selectedDeckId || "global";
  const selectedDeck = decks.find((d) => d.id === selectedDeckId);

  const renderIcon = (deck?: SelectorDeck) => {
    if (!deck) {
      return <BarChart3 className="h-4.5 w-4.5 text-primary shrink-0" />;
    }
    if (deck.icon_type === "image" && deck.custom_icon_path) {
      const url = getDeckIconUrl(deck.custom_icon_path);
      if (url) {
        return (
          <span className="relative inline-block w-4.5 h-4.5 rounded-full overflow-hidden border shrink-0">
            <Image src={url} alt={deck.name} fill className="object-cover" />
          </span>
        );
      }
    }
    return <span className="text-base shrink-0">{deck.emoji || "📚"}</span>;
  };

  return (
    <div className="w-full sm:max-w-xs">
      <Select value={currentValue} onValueChange={handleChange}>
        <SelectTrigger className="w-full h-10 bg-background/50 backdrop-blur-md border-muted/30 focus:ring-ring">
          <SelectValue placeholder={t("select_deck")}>
            <div className="flex items-center gap-2">
              {renderIcon(selectedDeck)}
              <span className="truncate">
                {selectedDeck ? selectedDeck.name : t("all_decks")}
              </span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-background/95 backdrop-blur-md">
          <SelectItem value="global" className="cursor-pointer">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-primary shrink-0" />
              <span>{t("all_decks")}</span>
            </div>
          </SelectItem>
          {decks.map((deck) => {
            const customUrl = deck.icon_type === "image" && deck.custom_icon_path ? getDeckIconUrl(deck.custom_icon_path) : null;
            return (
              <SelectItem key={deck.id} value={deck.id} className="cursor-pointer">
                <div className="flex items-center gap-2 max-w-[200px]">
                  {customUrl ? (
                    <span className="relative inline-block w-4 h-4 rounded-full overflow-hidden border shrink-0">
                      <Image
                        src={customUrl}
                        alt={deck.name}
                        fill
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span className="text-sm shrink-0">{deck.emoji || "📚"}</span>
                  )}
                  <span className="truncate">{deck.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ({deck.card_count})
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
