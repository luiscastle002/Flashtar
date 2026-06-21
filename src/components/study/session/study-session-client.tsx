"use client";

import { useEffect, useCallback, useRef, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreVertical, Edit, Pause, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import type { Editor } from "@tiptap/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { StudyCardDisplay } from "./study-card-display";
import { ConfidenceBar } from "./confidence-bar";
import { SessionCompletionScreen } from "./session-completion-screen";
import { submitReview, endStudySession, addMoreNewCards } from "@/actions/study-sessions";
import { updateStudyCard, suspendStudyCard, deleteStudyCard } from "@/actions/imports";
import { getGooglePickerConfig } from "@/actions/integrations";
import { mapGoogleDriveAudioAction } from "@/actions/audio";
import { RichTextEditor } from "@/components/flashcards/rich-text-editor";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import type { StudyCard, ConfidenceRating, CardAudio } from "@/types";

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

interface StudySessionClientProps {
  initialCards: StudyCard[];
  sessionId: string;
  deckId: string;
  deckName: string;
  showConfidenceBar: boolean;
  autoplayAudioFront?: boolean;
  autoplayAudioBack?: boolean;
}

interface SessionStats {
  studied: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
  newSeen: number;
}

interface SessionState {
  cards: StudyCard[];
  currentIndex: number;
  isFlipped: boolean;
  isSubmitting: boolean;
  isComplete: boolean;
  stats: SessionStats;
}

type SessionAction =
  | { type: "SET_FLIPPED"; isFlipped: boolean }
  | { type: "SET_SUBMITTING"; isSubmitting: boolean }
  | { type: "EDIT_CARD"; cardId: string; front: string; back: string }
  | { type: "REMOVE_CARD"; cardId: string }
  | { type: "APPEND_CARDS"; cards: StudyCard[] }
  | { type: "RATE_CARD_SUCCESS"; rating: ConfidenceRating; isNewCard: boolean }
  | { type: "COMPLETE_SESSION" };

function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "SET_FLIPPED":
      return { ...state, isFlipped: action.isFlipped };
    case "SET_SUBMITTING":
      return { ...state, isSubmitting: action.isSubmitting };
    case "EDIT_CARD":
      return {
        ...state,
        cards: state.cards.map((c) =>
          c.id === action.cardId ? { ...c, front: action.front, back: action.back } : c
        ),
      };
    case "REMOVE_CARD": {
      const updatedCards = state.cards.filter((c) => c.id !== action.cardId);
      const isQueueEmpty = updatedCards.length === 0;

      let nextIndex = state.currentIndex;
      // If we removed the last card, shift index back
      if (state.currentIndex >= updatedCards.length) {
        nextIndex = Math.max(0, updatedCards.length - 1);
      }

      const isComplete = isQueueEmpty || (updatedCards.length > 0 && nextIndex >= updatedCards.length);

      return {
        ...state,
        cards: updatedCards,
        currentIndex: nextIndex,
        isFlipped: false,
        isComplete,
      };
    }
    case "APPEND_CARDS": {
      const nextIndex = state.cards.length; // jump to first of new batch
      return {
        ...state,
        cards: [...state.cards, ...action.cards],
        currentIndex: nextIndex,
        isFlipped: false,
        isComplete: false,
      };
    }
    case "RATE_CARD_SUCCESS": {
      const nextIndex = state.currentIndex + 1;
      const isComplete = nextIndex >= state.cards.length;

      const rating = action.rating;
      const isNew = action.isNewCard;

      const newStats = {
        ...state.stats,
        studied: state.stats.studied + 1,
        again: state.stats.again + (rating === "again" ? 1 : 0),
        hard: state.stats.hard + (rating === "hard" ? 1 : 0),
        good: state.stats.good + (rating === "good" ? 1 : 0),
        easy: state.stats.easy + (rating === "easy" ? 1 : 0),
        newSeen: state.stats.newSeen + (isNew ? 1 : 0),
      };

      return {
        ...state,
        currentIndex: isComplete ? state.currentIndex : nextIndex,
        isFlipped: false,
        isComplete,
        stats: newStats,
      };
    }
    case "COMPLETE_SESSION":
      return { ...state, isComplete: true };
    default:
      return state;
  }
}

export function StudySessionClient({
  initialCards,
  sessionId,
  deckId,
  deckName,
  showConfidenceBar,
  autoplayAudioFront = false,
  autoplayAudioBack = false,
}: StudySessionClientProps) {
  const router = useRouter();
  const t = useTranslations("study.session");
  const tRoot = useTranslations();
  const tCommon = useTranslations("common");

  const [state, dispatch] = useReducer(sessionReducer, {
    cards: initialCards,
    currentIndex: 0,
    isFlipped: false,
    isSubmitting: false,
    isComplete: initialCards.length === 0,
    stats: { studied: 0, again: 0, hard: 0, good: 0, easy: 0, newSeen: 0 },
  });

  const currentCard = state.cards[state.currentIndex];

  // Dialog and dropdown states
  const [editOpen, setEditOpen] = useState(false);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [confirmSuspendOpen, setConfirmSuspendOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  const [deletedAudioIds, setDeletedAudioIds] = useState<string[]>([]);
  const frontEditorRef = useRef<Editor | null>(null);
  const backEditorRef = useRef<Editor | null>(null);

  const handleDeleteAudio = useCallback((audioId: string) => {
    setDeletedAudioIds((prev) => [...prev, audioId]);
  }, []);

  const handleUpdateAudio = useCallback((audioRef: CardAudio) => {
    if (currentCard) {
      const currentAudios = currentCard.audios || [];
      const exists = currentAudios.some(
        (a) =>
          a.side === audioRef.side &&
          a.audio_files?.file_id === audioRef.audio_files?.file_id
      );
      if (!exists) {
        currentCard.audios = [...currentAudios, audioRef];
      }
    }
  }, [currentCard]);

  const handleAudioPick = async (side: "front" | "back", editorInstance: Editor) => {
    if (!currentCard) return;
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
                  if (!currentCard.source_flashcard_id) {
                    toast.error("Cannot map audio to a card without a source flashcard.");
                    return;
                  }
                  const res = await mapGoogleDriveAudioAction({
                    flashcardId: currentCard.source_flashcard_id,
                    side,
                    fileId: doc.id,
                    filename: doc.name,
                    fileSize: doc.sizeBytes,
                  });

                  if ("error" in res && res.error) {
                    toast.error(res.error);
                  } else if (res.normalizedName && res.audioRef) {
                    handleUpdateAudio(res.audioRef);
                    // Focus and insert content
                    editorInstance.chain().focus().insertContent({
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

  const cardStartRef = useRef<number>(Date.now());
  const sessionStartRef = useRef<number>(Date.now());

  const progress = state.cards.length > 0
    ? Math.round((state.currentIndex / state.cards.length) * 100)
    : 100;

  // Initialize edit form values when currentCard changes or edit opens
  useEffect(() => {
    if (currentCard) {
      setEditFront(currentCard.front);
      setEditBack(currentCard.back);
    }
  }, [currentCard, editOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target !== document.body && (e.target as HTMLElement).tagName !== "BODY") {
        if ((e.target as HTMLElement).tagName === "INPUT" ||
            (e.target as HTMLElement).tagName === "TEXTAREA") return;
      }

      if (!state.isFlipped) {
        if (e.code === "Space" || e.code === "Enter") {
          e.preventDefault();
          dispatch({ type: "SET_FLIPPED", isFlipped: true });
        }
        return;
      }

      if (e.key === "1") handleRate(0);
      if (e.key === "2") handleRate(30);
      if (e.key === "3") handleRate(60);
      if (e.key === "4") handleRate(90);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isFlipped, state.currentIndex, state.cards.length]);

  const handleFlip = useCallback(() => {
    dispatch({ type: "SET_FLIPPED", isFlipped: true });
  }, []);

  const handleRate = useCallback(async (confidencePct: number) => {
    if (!currentCard || state.isSubmitting) return;
    dispatch({ type: "SET_SUBMITTING", isSubmitting: true });

    const durationMs = Date.now() - cardStartRef.current;

    try {
      const result = await submitReview({
        sessionId,
        cardId: currentCard.id,
        confidencePct,
        durationMs,
      });

      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        dispatch({ type: "SET_SUBMITTING", isSubmitting: false });
        return;
      }

      const rating: ConfidenceRating = result.data?.rating ?? "good";
      dispatch({
        type: "RATE_CARD_SUCCESS",
        rating,
        isNewCard: currentCard.state === "new",
      });
      cardStartRef.current = Date.now();
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      dispatch({ type: "SET_SUBMITTING", isSubmitting: false });
    }
  }, [currentCard, state.isSubmitting, sessionId, tRoot, tCommon]);

  // Session options triggers
  const handleEditCard = async () => {
    if (!currentCard || isActionPending) return;
    setIsActionPending(true);
    try {
      const res = await updateStudyCard(currentCard.id, {
        front: editFront,
        back: editBack,
      }, deletedAudioIds);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        dispatch({
          type: "EDIT_CARD",
          cardId: currentCard.id,
          front: editFront,
          back: editBack,
        });
        toast.success(t("toast_edit_success"));
        setDeletedAudioIds([]);
        setEditOpen(false);
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsActionPending(false);
    }
  };

  const handleSuspendCard = async () => {
    if (!currentCard || isActionPending) return;
    setIsActionPending(true);
    try {
      const res = await suspendStudyCard(currentCard.id);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        dispatch({ type: "REMOVE_CARD", cardId: currentCard.id });
        toast.success(t("toast_suspend_success"));
        setConfirmSuspendOpen(false);
        cardStartRef.current = Date.now();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsActionPending(false);
    }
  };

  const handleDeleteCard = async () => {
    if (!currentCard || isActionPending) return;
    setIsActionPending(true);
    try {
      const res = await deleteStudyCard(currentCard.id, deckId);
      if ("error" in res && res.error) {
        toast.error(res.error);
      } else {
        dispatch({ type: "REMOVE_CARD", cardId: currentCard.id });
        toast.success(t("toast_delete_success"));
        setConfirmDeleteOpen(false);
        cardStartRef.current = Date.now();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsActionPending(false);
    }
  };

  async function handleFinish() {
    const durationMs = Date.now() - sessionStartRef.current;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await endStudySession(sessionId, {
      cardsStudied: state.stats.studied,
      cardsAgain: state.stats.again,
      cardsHard: state.stats.hard,
      cardsGood: state.stats.good,
      cardsEasy: state.stats.easy,
      newCardsSeen: state.stats.newSeen,
      durationMs,
    }, timezone);
    router.push(`/study/${deckId}`);
    router.refresh();
  }

  async function handleStudyMore() {
    const result = await addMoreNewCards(deckId);
    if ("error" in result && result.error) {
      toast.error(translateError(result.error, tRoot));
      return;
    }
    if (!result.cards.length) {
      toast.info(t("no_more_new_cards"));
      return;
    }
    dispatch({ type: "APPEND_CARDS", cards: result.cards });
    cardStartRef.current = Date.now();
  }

  if (state.isComplete) {
    return (
      <SessionCompletionScreen
        stats={state.stats}
        durationMs={Date.now() - sessionStartRef.current}
        onFinish={handleFinish}
        onStudyMore={handleStudyMore}
        deckId={deckId}
      />
    );
  }

  if (!currentCard) return null;

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] max-w-2xl mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={handleFinish}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          {deckName}
        </Button>
        <div className="flex-1">
          <Progress value={progress} className="h-2" />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums shrink-0">
          {state.currentIndex + 1}/{state.cards.length}
        </span>
        {state.isFlipped && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground shrink-0">
                <MoreVertical className="h-4.5 w-4.5" />
                <span className="sr-only">{t("options_tooltip")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />
                {t("edit_card")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmSuspendOpen(true)} className="text-orange-600 dark:text-orange-400">
                <Pause className="h-4 w-4 mr-2" />
                {t("suspend_card")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setConfirmDeleteOpen(true)} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-4 w-4 mr-2" />
                {t("delete_card")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Card display */}
      <div className="flex-1 flex flex-col">
        <StudyCardDisplay
          card={currentCard}
          isFlipped={state.isFlipped}
          onFlip={handleFlip}
          autoplayAudioFront={autoplayAudioFront}
          autoplayAudioBack={autoplayAudioBack}
        />

        {/* Answer controls — only shown after flip */}
        {state.isFlipped && (
          <div className="mt-6 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {showConfidenceBar ? (
              <ConfidenceBar
                onRate={handleRate}
                disabled={state.isSubmitting}
              />
            ) : (
              <ClassicButtons onRate={handleRate} disabled={state.isSubmitting} />
            )}
            <p className="text-center text-xs text-muted-foreground mt-3">
              {t.rich("keyboard_help", {
                space: (chunks) => <kbd className="font-mono bg-muted px-1 rounded">{chunks}</kbd>,
                keys: () => (
                  <>
                    <kbd className="font-mono bg-muted px-1 rounded">1</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">2</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">3</kbd>{" "}
                    <kbd className="font-mono bg-muted px-1 rounded">4</kbd>
                  </>
                )
              })}
            </p>
          </div>
        )}

        {/* Show Answer button */}
        {!state.isFlipped && (
          <div className="mt-6 text-center">
            <Button
              size="lg"
              onClick={handleFlip}
              className="px-10 animate-in fade-in duration-200"
            >
              {t("show_answer")}
              <span className="ml-2 text-xs opacity-60 font-mono">{t("keyboard_space")}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Edit Flashcard Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("edit_modal_title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="front">{t("edit_modal_front")}</Label>
              <RichTextEditor
                content={editFront}
                onChange={setEditFront}
                placeholder="Front content..."
                audios={currentCard?.audios}
                onAudioClick={(editor) => handleAudioPick("front", editor)}
                onMoveSide={(audioId, deleteNode) => {
                  deleteNode();
                  if (backEditorRef.current) {
                    backEditorRef.current.chain().focus().insertContent({
                      type: "audio",
                      attrs: { audioId }
                    }).run();
                  }
                }}
                onDelete={handleDeleteAudio}
                editorRef={frontEditorRef}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="back">{t("edit_modal_back")}</Label>
              <RichTextEditor
                content={editBack}
                onChange={setEditBack}
                placeholder="Back content..."
                audios={currentCard?.audios}
                onAudioClick={(editor) => handleAudioPick("back", editor)}
                onMoveSide={(audioId, deleteNode) => {
                  deleteNode();
                  if (frontEditorRef.current) {
                    frontEditorRef.current.chain().focus().insertContent({
                      type: "audio",
                      attrs: { audioId }
                    }).run();
                  }
                }}
                onDelete={handleDeleteAudio}
                editorRef={backEditorRef}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isActionPending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleEditCard} disabled={isActionPending || !editFront.trim()}>
              {isActionPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("edit_modal_save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Card Confirm Dialog */}
      <Dialog open={confirmSuspendOpen} onOpenChange={setConfirmSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("suspend_card")}</DialogTitle>
            <DialogDescription>
              {tRoot("study.card_manager.bulk_actions.suspend_confirm_desc", { count: 1 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSuspendOpen(false)} disabled={isActionPending}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSuspendCard} disabled={isActionPending}>
              {isActionPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("suspend_card")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Card Confirm Dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete_card")}</DialogTitle>
            <DialogDescription>
              {tRoot("study.card_manager.bulk_actions.delete_confirm_desc", { count: 1 })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} disabled={isActionPending}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDeleteCard} disabled={isActionPending}>
              {isActionPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Classic 4-button fallback (when show_confidence_bar = false)
function ClassicButtons({
  onRate,
  disabled,
}: {
  onRate: (pct: number) => void;
  disabled: boolean;
}) {
  const t = useTranslations("study.session");
  const buttons = [
    { key: "again", pct: 10, className: "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950" },
    { key: "hard",  pct: 35, className: "border-orange-200 text-orange-600 hover:bg-orange-50 dark:border-orange-900 dark:text-orange-400 dark:hover:bg-orange-950" },
    { key: "good",  pct: 65, className: "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950" },
    { key: "easy",  pct: 90, className: "border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950" },
  ] as const;

  return (
    <div className="grid grid-cols-4 gap-2">
      {buttons.map(({ key, pct, className }) => (
        <Button
          key={key}
          variant="outline"
          disabled={disabled}
          onClick={() => onRate(pct)}
          className={`h-12 text-sm font-medium ${className}`}
        >
          {t(`rating.${key}`)}
        </Button>
      ))}
    </div>
  );
}
