"use client";

import { useState, useCallback, useRef } from "react";
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
import type { Editor } from "@tiptap/react";
import { RichTextEditor } from "@/components/flashcards/rich-text-editor";
import { AddToStudyDeckButton } from "@/components/study/add-to-study-deck-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGooglePickerConfig } from "@/actions/integrations";
import { mapGoogleDriveAudioAction } from "@/actions/audio";
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
import type { Deck, Flashcard, Plan, CardAudio } from "@/types";
import { PLAN_LIMITS } from "@/types";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

interface SortableCardProps {
  card: Flashcard;
  index: number;
  onUpdate: (id: string, field: "front" | "back", value: string) => void;
  onUpdateAudio: (id: string, audioRef: CardAudio) => void;
  onDeleteAudio: (audioId: string) => void;
  onDelete: (id: string) => void;
}

type GoogleSdk = {
  gapi: {
    load: (name: string, opts: { callback: () => void }) => void;
  };
  google: {
    picker: {
      DocsView: new (viewId: string) => {
        setMimeTypes: (types: string) => {
          setParent: (id: string) => unknown;
        };
      };
      ViewId: {
        DOCS: string;
      };
      PickerBuilder: new () => {
        addView: (view: unknown) => {
          setOAuthToken: (token: string) => {
            setDeveloperKey: (key: string) => {
              setCallback: (cb: (data: { action: string; docs: Array<{ id: string; name: string; sizeBytes?: number }> }) => Promise<void>) => {
                build: () => {
                  setVisible: (visible: boolean) => void;
                };
              };
            };
          };
        };
      };
      Action: {
        PICKED: string;
      };
    };
  };
};

function SortableCard({ card, index, onUpdate, onUpdateAudio, onDeleteAudio, onDelete }: SortableCardProps) {
  const t = useTranslations("decks");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const frontEditorRef = useRef<Editor | null>(null);
  const backEditorRef = useRef<Editor | null>(null);

  const handleAudioPick = async (side: "front" | "back", editorInstance: Editor) => {
    try {
      const config = await getGooglePickerConfig();
      if ("error" in config) {
        toast.error(config.error);
        return;
      }

      const { accessToken, audioFolderId } = config;

      const showPicker = () => {
        const win = window as unknown as GoogleSdk;
        if (!win.gapi || !win.google) {
          toast.error("Google Picker SDK failed to load.");
          return;
        }
        win.gapi.load("picker", {
          callback: () => {
            const view = new win.google.picker.DocsView(win.google.picker.ViewId.DOCS)
              .setMimeTypes("audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg")
              .setParent(audioFolderId);

            const picker = new win.google.picker.PickerBuilder()
              .addView(view)
              .setOAuthToken(accessToken)
              .setDeveloperKey("")
              .setCallback(async (data: { action: string; docs: Array<{ id: string; name: string; sizeBytes?: number }> }) => {
                if (data.action === win.google.picker.Action.PICKED) {
                  const doc = data.docs[0];
                  const res = await mapGoogleDriveAudioAction({
                    flashcardId: card.id,
                    side,
                    fileId: doc.id,
                    filename: doc.name,
                    fileSize: doc.sizeBytes,
                  });

                  if ("error" in res && res.error) {
                    toast.error(res.error);
                  } else if (res.normalizedName && res.audioRef) {
                    onUpdateAudio(card.id, res.audioRef);
                    // Insert node in Tiptap at end of content
                    editorInstance.chain().focus().insertContentAt(editorInstance.state.doc.content.size, {
                      type: "audio",
                      attrs: {
                        audioId: res.audioRef.id,
                      },
                    }).run();
                    toast.success("Audio file inserted!");
                  }
                }
              })
              .build();
            picker.setVisible(true);
          },
        });
      };

      const win = window as unknown as GoogleSdk;
      if (!win.gapi) {
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.onload = () => {
          const winG = window as unknown as GoogleSdk;
          if (!winG.google) {
            const gisScript = document.createElement("script");
            gisScript.src = "https://accounts.google.com/gsi/client";
            gisScript.onload = () => showPicker();
            document.body.appendChild(gisScript);
          } else {
            showPicker();
          }
        };
        document.body.appendChild(script);
      } else {
        showPicker();
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(errMsg || "Failed to load Google Picker");
    }
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
        <CardTitle className="text-sm font-medium flex-1">
          {t("editor.card_index", { index: index + 1 })}
        </CardTitle>
        <span className="text-xs text-muted-foreground capitalize">{card.card_type}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(card.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-muted-foreground">{t("editor.front")}</p>
          </div>
          <RichTextEditor
            content={card.front}
            onChange={(html) => onUpdate(card.id, "front", html)}
            placeholder={t("editor.front_placeholder")}
            audios={card.audios}
            onAudioClick={(editor) => handleAudioPick("front", editor)}
            onMoveSide={(audioId, deleteNode) => {
              deleteNode();
              if (backEditorRef.current) {
                backEditorRef.current.chain().focus().insertContentAt(backEditorRef.current.state.doc.content.size, {
                  type: "audio",
                  attrs: { audioId }
                }).run();
              }
            }}
            onDelete={onDeleteAudio}
            editorRef={frontEditorRef}
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <p className="text-xs text-muted-foreground">{t("editor.back")}</p>
          </div>
          <RichTextEditor
            content={card.back}
            onChange={(html) => onUpdate(card.id, "back", html)}
            placeholder={t("editor.back_placeholder")}
            audios={card.audios}
            onAudioClick={(editor) => handleAudioPick("back", editor)}
            onMoveSide={(audioId, deleteNode) => {
              deleteNode();
              if (frontEditorRef.current) {
                frontEditorRef.current.chain().focus().insertContentAt(frontEditorRef.current.state.doc.content.size, {
                  type: "audio",
                  attrs: { audioId }
                }).run();
              }
            }}
            onDelete={onDeleteAudio}
            editorRef={backEditorRef}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface DeckEditorProps {
  deck: Deck;
  initialCards: Flashcard[];
  plan: Plan;
}

export function DeckEditor({ deck: initialDeck, initialCards, plan }: DeckEditorProps) {
  const t = useTranslations("decks");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");

  const [deck, setDeck] = useState(initialDeck);
  const [cards, setCards] = useState(initialCards);
  const [deckName, setDeckName] = useState(deck.name);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deletedAudioIds, setDeletedAudioIds] = useState<string[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpdate = useCallback((id: string, field: "front" | "back", value: string) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }, []);

  const handleUpdateAudio = useCallback((id: string, audioRef: CardAudio) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const currentAudios = c.audios || [];
          const exists = currentAudios.some(
            (a) =>
              a.side === audioRef.side &&
              a.audio_files?.file_id === audioRef.audio_files?.file_id
          );
          if (exists) return c;
          return { ...c, audios: [...currentAudios, audioRef] };
        }
        return c;
      })
    );
  }, []);

  const handleDeleteAudio = useCallback((audioId: string) => {
    setDeletedAudioIds((prev) => [...prev, audioId]);
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
      toast.error(translateError(result.error, tErr));
      return;
    }
    if (result.data) {
      setCards((prev) => [...prev, result.data!]);
      toast.success(t("editor.toast_card_added"));
    }
  }

  async function handleDeleteCard(id: string) {
    const result = await deleteFlashcard(id, deck.id);
    if (result.error) {
      toast.error(translateError(result.error, tErr));
      return;
    }
    setCards((prev) => prev.filter((c) => c.id !== id));
    toast.success(t("editor.toast_card_deleted"));
  }

  async function handleSave() {
    setSaving(true);
    const [deckResult, cardsResult] = await Promise.all([
      updateDeck(deck.id, { name: deckName }),
      bulkUpdateFlashcards(
        deck.id,
        cards.map((c) => ({ id: c.id, front: c.front, back: c.back, card_type: c.card_type })),
        deletedAudioIds
      ),
    ]);
    setSaving(false);

    if (deckResult.error || cardsResult.error) {
      toast.error(
        translateError(deckResult.error ?? cardsResult.error, tErr) ||
          t("editor.toast_save_failed")
      );
      return;
    }

    if (deckResult.data) setDeck(deckResult.data);
    setDeletedAudioIds([]);
    toast.success(t("editor.toast_saved"));
  }

  async function handleExportCsv() {
    const csv = flashcardsToCsv(deck.name, cards);
    downloadCsv(`${deck.name}.csv`, csv);
    toast.success(t("editor.toast_csv_downloaded"));
  }

  async function handleExportApkg() {
    if (!PLAN_LIMITS[plan].apkgExport) {
      toast.error(t("editor.apkg_pro_required"));
      return;
    }

    setExporting(true);
    const toastId = toast.loading(t("editor.apkg_loading"));

    try {
      const { buildApkgClient } = await import("@/lib/export/apkg-client");
      toast.loading(t("editor.apkg_generating"), { id: toastId });
      const bytes = await buildApkgClient(deck.name, cards);

      toast.loading(t("editor.apkg_downloading"), { id: toastId });
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${deck.name}.apkg`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(t("editor.toast_apkg_downloaded"), { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export APKG", { id: toastId });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              className="text-2xl font-bold border-0 px-0 h-auto focus-visible:ring-0"
            />
            <p className="text-sm text-muted-foreground">
              {t("editor.cards_count", { count: cards.length })} · {deck.card_type} · {deck.difficulty}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddToStudyDeckButton generatedDeckId={deck.id} flashcardCount={cards.length} />
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportApkg} disabled={exporting}>
              <Download className={`mr-2 h-4 w-4 ${exporting ? "animate-bounce" : ""}`} />
              {exporting ? tCommon("loading") : "APKG"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? tCommon("saving") : tCommon("save")}
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
                  onUpdateAudio={handleUpdateAudio}
                  onDeleteAudio={handleDeleteAudio}
                  onDelete={handleDeleteCard}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button variant="outline" className="w-full" onClick={handleAddCard}>
          <Plus className="mr-2 h-4 w-4" />
          {t("editor.add_card")}
        </Button>
      </div>
  );
}
