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

interface ImportToStudyDeckButtonProps {
  deckId: string; // The study deck we're importing INTO
}

// This component fetches the list of generated decks via a client-side fetch
// to avoid prop-drilling through the server chain.
export function ImportToStudyDeckButton({ deckId }: ImportToStudyDeckButtonProps) {
  const router = useRouter();
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
        toast.error(result.error);
        return;
      }
      const summary = result.results?.[0];
      if (summary?.imported === 0) {
        toast.info("All cards from this deck are already imported.");
      } else {
        toast.success(`Imported ${summary?.imported} card${summary?.imported !== 1 ? "s" : ""}!`);
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
          Add Cards
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import cards</DialogTitle>
          <DialogDescription>
            Choose an AI-generated deck to snapshot into this study deck.
            Cards won&apos;t be duplicated if already imported.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : generatedDecks.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No generated decks found.{" "}
              <a href="/generate" className="underline">Generate one first.</a>
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
                        {deck.flashcard_count} cards
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
            Cancel
          </Button>
          <Button
            disabled={!selectedDeckId || pending}
            onClick={handleImport}
          >
            {pending ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importing…</>
            ) : (
              "Import Cards"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
