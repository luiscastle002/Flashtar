"use client";

import { useState, useTransition } from "react";
import { Plus, Check, Loader2, BookOpen } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { getStudyDecks, createStudyDeck } from "@/actions/study-decks";
import { importFromGeneratedDeck } from "@/actions/imports";
import { toast } from "sonner";
import type { StudyDeck } from "@/types";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

interface AddToStudyDeckButtonProps {
  generatedDeckId: string;
  flashcardCount: number;
}

export function AddToStudyDeckButton({ generatedDeckId, flashcardCount }: AddToStudyDeckButtonProps) {
  const t = useTranslations("study");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [studyDecks, setStudyDecks] = useState<StudyDeck[]>([]);
  const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
  const [newDeckName, setNewDeckName] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);

  const [importPending, startImportTransition] = useTransition();

  async function handleOpenChange(val: boolean) {
    setOpen(val);
    if (val) {
      await loadStudyDecks();
    } else {
      setSelectedDeckIds([]);
      setNewDeckName("");
    }
  }

  async function loadStudyDecks() {
    setLoading(true);
    try {
      const decks = await getStudyDecks();
      setStudyDecks(decks);
    } catch (err) {
      console.error("Error loading study decks:", err);
      toast.error(t("toast_load_failed"));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateNewDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeckName.trim()) return;

    setCreatingNew(true);
    try {
      const result = await createStudyDeck({
        name: newDeckName.trim(),
        emoji: "📚",
        color: "#6366f1",
      });

      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        return;
      }

      toast.success(t("create.toast_created"));
      setNewDeckName("");
      // Reload list and automatically select the new deck
      const decks = await getStudyDecks();
      setStudyDecks(decks);
      if (result.data) {
        setSelectedDeckIds((prev) => [...prev, result.data.id]);
      }
    } catch (err) {
      console.error("Error creating study deck:", err);
      toast.error(t("create.toast_create_failed"));
    } finally {
      setCreatingNew(false);
    }
  }

  function handleToggleSelect(deckId: string) {
    setSelectedDeckIds((prev) =>
      prev.includes(deckId)
        ? prev.filter((id) => id !== deckId)
        : [...prev, deckId]
    );
  }

  function handleImport() {
    if (selectedDeckIds.length === 0) return;

    startImportTransition(async () => {
      try {
        const result = await importFromGeneratedDeck(generatedDeckId, selectedDeckIds);
        if ("error" in result && result.error) {
          toast.error(translateError(result.error, tRoot));
          return;
        }

        // Aggregate results
        let totalImported = 0;
        let totalSkipped = 0;
        result.results?.forEach((r) => {
          totalImported += r.imported ?? 0;
          totalSkipped += r.skipped ?? 0;
        });

        if (totalImported === 0 && totalSkipped > 0) {
          toast.info(t("all_cards_present"));
        } else {
          toast.success(
            t("toast_imported", {
              count: totalImported,
              decksCount: selectedDeckIds.length,
            })
          );
        }
        setOpen(false);
      } catch (err) {
        console.error("Import error:", err);
        toast.error(t("toast_import_failed"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={flashcardCount === 0}>
          <BookOpen className="mr-2 h-4 w-4" />
          {t("add_to_study")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add_to_study")}</DialogTitle>
          <DialogDescription>
            {t("import_description", { count: flashcardCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Create new deck inline */}
          <form onSubmit={handleCreateNewDeck} className="flex gap-2 items-center">
            <Input
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              placeholder={t("create_new_placeholder")}
              className="text-sm h-9"
              maxLength={100}
              disabled={creatingNew}
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="shrink-0 h-9"
              disabled={!newDeckName.trim() || creatingNew}
            >
              {creatingNew ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              {tCommon("create")}
            </Button>
          </form>

          {/* Checklist of study decks */}
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : studyDecks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("no_study_decks")}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t("target_decks")}
              </p>
              <ScrollArea className="h-48 border rounded-lg p-2 bg-accent/10">
                <div className="space-y-1.5 pr-2">
                  {studyDecks.map((deck) => {
                    const isSelected = selectedDeckIds.includes(deck.id);
                    return (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => handleToggleSelect(deck.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md text-left transition-all border text-sm ${
                          isSelected
                            ? "border-primary bg-primary/5 font-medium"
                            : "border-transparent hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span>{deck.emoji ?? "📚"}</span>
                          <span className="truncate">{deck.name}</span>
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            size="sm"
            disabled={selectedDeckIds.length === 0 || importPending}
            onClick={handleImport}
          >
            {importPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {t("importing")}
              </>
            ) : (
              t("add_to_decks_count", { count: selectedDeckIds.length })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
