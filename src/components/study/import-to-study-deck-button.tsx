"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { importFromGeneratedDeck } from "@/actions/imports";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

interface ImportToStudyDeckButtonProps {
  deckId: string; // The study deck we're importing INTO
}

// This component fetches the list of generated decks via a client-side fetch
// to avoid prop-drilling through the server chain.
export function ImportToStudyDeckButton({ deckId }: ImportToStudyDeckButtonProps) {
  const router = useRouter();
  const t = useTranslations("study.import");
  const tRoot = useTranslations();
  
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generatedDecks, setGeneratedDecks] = useState<Array<{
    id: string; name: string; flashcard_count: number;
  }>>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadDecks() {
    setLoading(true);
    try {
      const res = await fetch("/api/study/available-decks");
      if (res.ok) {
        const data = await res.json();
        setGeneratedDecks(data.decks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (val) loadDecks();
    else setSelectedDeckId(null);
  }

  function handleImport() {
    if (!selectedDeckId) return;
    startTransition(async () => {
      const result = await importFromGeneratedDeck(selectedDeckId, [deckId]);
      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        return;
      }
      const summary = result.results?.[0];
      if (summary?.imported === 0) {
        toast.info(t("all_imported"));
      } else {
        toast.success(t("toast_success", { count: summary?.imported ?? 0 }));
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : generatedDecks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("no_decks")}{" "}
              <a href="/generate" className="underline">{t("generate_first")}</a>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-1.5 pr-4">
                {generatedDecks.map((deck) => (
                  <button
                    key={deck.id}
                    type="button"
                    onClick={() => setSelectedDeckId(deck.id === selectedDeckId ? null : deck.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                      selectedDeckId === deck.id
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40 hover:bg-accent/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{deck.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("cards_count_plural", { count: deck.flashcard_count })}
                      </p>
                    </div>
                    {selectedDeckId === deck.id && (
                      <Check className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {tRoot("common.cancel")}
          </Button>
          <Button
            disabled={!selectedDeckId || pending}
            onClick={handleImport}
          >
            {pending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {tRoot("common.creating")}</>
            ) : (
              t("import_cards_button")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
