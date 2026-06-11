"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, Download, Save } from "lucide-react";
import { RichTextEditor } from "@/components/flashcards/rich-text-editor";
import { DashboardShellClient } from "@/components/dashboard/dashboard-shell-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createFlashcard,
  deleteFlashcard,
  bulkUpdateFlashcards,
  reorderFlashcards,
} from "@/actions/flashcards";
import { updateDeck } from "@/actions/decks";
import { downloadCsv, flashcardsToCsv } from "@/lib/export/csv";
import { toast } from "sonner";
import type { Deck, Flashcard, Plan, Profile } from "@/types";
import { PLAN_LIMITS } from "@/types";

interface SortableCardProps {
  card: Flashcard;
  index: number;
  onUpdate: (id: string, field: "front" | "back", value: string) => void;
  onDelete: (id: string) => void;
}

function SortableCard({ card, index, onUpdate, onDelete }: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardHeader className="py-3 px-4 flex flex-row items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <CardTitle className="text-sm font-medium flex-1">Card {index + 1}</CardTitle>
        <span className="text-xs text-muted-foreground capitalize">{card.card_type}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(card.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Front</p>
          <RichTextEditor
            content={card.front}
            onChange={(html) => onUpdate(card.id, "front", html)}
            placeholder="Question or cloze text (use {{c1::answer}} for cloze)"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Back</p>
          <RichTextEditor
            content={card.back}
            onChange={(html) => onUpdate(card.id, "back", html)}
            placeholder="Answer"
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface DeckEditorProps {
  deck: Deck;
  initialCards: Flashcard[];
  profile: Profile | null;
  plan: Plan;
}

export function DeckEditor({ deck: initialDeck, initialCards, profile, plan }: DeckEditorProps) {
  const [deck, setDeck] = useState(initialDeck);
  const [cards, setCards] = useState(initialCards);
  const [deckName, setDeckName] = useState(deck.name);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpdate = useCallback((id: string, field: "front" | "back", value: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCards((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      reorderFlashcards(deck.id, reordered.map((c) => c.id));
      return reordered;
    });
  }

  async function handleAddCard() {
    const result = await createFlashcard(deck.id, {
      front: "<p>New question</p>",
      back: "<p>Answer</p>",
      card_type: deck.card_type === "mixed" ? "basic" : deck.card_type,
    });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.data) {
      setCards((prev) => [...prev, result.data!]);
      toast.success("Card added");
    }
  }

  async function handleDeleteCard(id: string) {
    const result = await deleteFlashcard(id, deck.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== id));
    toast.success("Card deleted");
  }

  async function handleSave() {
    setSaving(true);
    const [deckResult, cardsResult] = await Promise.all([
      updateDeck(deck.id, { name: deckName }),
      bulkUpdateFlashcards(
        deck.id,
        cards.map((c) => ({ id: c.id, front: c.front, back: c.back, card_type: c.card_type }))
      ),
    ]);
    setSaving(false);

    if (deckResult.error || cardsResult.error) {
      toast.error(deckResult.error ?? cardsResult.error ?? "Save failed");
      return;
    }

    if (deckResult.data) setDeck(deckResult.data);
    toast.success("Deck saved!");
  }

  async function handleExportCsv() {
    const csv = flashcardsToCsv(deck.name, cards);
    downloadCsv(`${deck.name}.csv`, csv);
    toast.success("CSV downloaded");
  }

  async function handleExportApkg() {
    if (!PLAN_LIMITS[plan].apkgExport) {
      toast.error("APKG export requires a Pro subscription.");
      return;
    }

    setExporting(true);
    const toastId = toast.loading("Initializing Anki compiler... (loading WebAssembly)");

    try {
      const { buildApkgClient } = await import("@/lib/export/apkg-client");
      toast.loading("Generating APKG package...", { id: toastId });
      const bytes = await buildApkgClient(deck.name, cards);

      toast.loading("Downloading...", { id: toastId });
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${deck.name}.apkg`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success("APKG downloaded successfully!", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export APKG", { id: toastId });
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardShellClient currentPath="/decks" profile={profile}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="text-2xl font-bold border-0 px-0 h-auto focus-visible:ring-0"
            />
            <p className="text-sm text-muted-foreground">
              {cards.length} cards · {deck.card_type} · {deck.difficulty}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportApkg} disabled={exporting}>
              <Download className={`mr-2 h-4 w-4 ${exporting ? "animate-bounce" : ""}`} />
              {exporting ? "Exporting..." : "APKG"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {cards.map((card, index) => (
                <SortableCard
                  key={card.id}
                  card={card}
                  index={index}
                  onUpdate={handleUpdate}
                  onDelete={handleDeleteCard}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button variant="outline" className="w-full" onClick={handleAddCard}>
          <Plus className="mr-2 h-4 w-4" />
          Add Card
        </Button>
      </div>
    </DashboardShellClient>
  );
}
