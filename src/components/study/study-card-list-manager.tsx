"use client";

import React, { useState, useEffect, useTransition, useCallback, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Trash2, ShieldAlert, Loader2, Ban, Play, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StudyCardListItem } from "./study-card-list-item";
import { bulkDeleteStudyCards, bulkSuspendStudyCards, bulkUnsuspendStudyCards, bulkUpdateStudyCards } from "@/actions/imports";
import { getGooglePickerConfig } from "@/actions/integrations";
import { mapGoogleDriveAudioAction } from "@/actions/audio";
import { RichTextEditor } from "@/components/flashcards/rich-text-editor";
import type { StudyCard, CardAudio } from "@/types";
import type { Editor } from "@tiptap/react";

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

interface StudyCardListManagerProps {
  initialCards: StudyCard[];
  totalCount: number;
  useKeyset: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
  deckId: string;
}

export function StudyCardListManager({
  initialCards,
  totalCount,
  useKeyset,
  nextCursor,
  prevCursor,
  deckId,
}: StudyCardListManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsRef = React.useRef(searchParams);
  searchParamsRef.current = searchParams;
  const t = useTranslations("study.card_manager");
  const tCommon = useTranslations("common");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Search input local state
  const [searchVal, setSearchVal] = useState(searchParams.get("search") ?? "");

  // Modal states
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmSuspendOpen, setConfirmSuspendOpen] = useState(false);
  const [confirmUnsuspendOpen, setConfirmUnsuspendOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  // Edit fields state
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [editTags, setEditTags] = useState("");
  const [bulkAddTags, setBulkAddTags] = useState("");
  const [bulkRemoveTags, setBulkRemoveTags] = useState("");
  const [bulkFlagAction, setBulkFlagAction] = useState<"no_change" | "flag" | "unflag">("no_change");

  const [deletedAudioIds, setDeletedAudioIds] = useState<string[]>([]);
  const [editingCard, setEditingCard] = useState<StudyCard | null>(null);

  const frontEditorRef = useRef<Editor | null>(null);
  const backEditorRef = useRef<Editor | null>(null);
  const lastFocusedCardId = useRef<string | null>(null);

  const handleDeleteAudio = useCallback((audioId: string) => {
    setDeletedAudioIds((prev) => [...prev, audioId]);
  }, []);

  const handleUpdateAudio = useCallback((id: string, audioRef: CardAudio) => {
    setEditingCard((prev) => {
      if (!prev) return null;
      const currentAudios = prev.audios || [];
      const exists = currentAudios.some(
        (a) =>
          a.side === audioRef.side &&
          a.audio_files?.file_id === audioRef.audio_files?.file_id
      );
      if (exists) return prev;
      return { ...prev, audios: [...currentAudios, audioRef] };
    });
  }, []);

  const handleAudioPick = async (side: "front" | "back", editorInstance: Editor) => {
    if (!editingCard) return;
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
                  if (!editingCard.source_flashcard_id) {
                    toast.error("Cannot map audio to a card without a source flashcard.");
                    return;
                  }
                  const res = await mapGoogleDriveAudioAction({
                    flashcardId: editingCard.source_flashcard_id,
                    side,
                    fileId: doc.id,
                    filename: doc.name,
                    fileSize: doc.sizeBytes,
                  });

                  if ("error" in res && res.error) {
                    toast.error(res.error);
                  } else if (res.normalizedName && res.audioRef) {
                    handleUpdateAudio(editingCard.id, res.audioRef);
                    // Focus and insert content at end
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

  const currentPage = Number(searchParams.get("page") ?? "1");
  const currentSort = searchParams.get("sort") ?? "created_desc";
  const currentSuspended = searchParams.get("suspended") ?? "all";

  // Clear selection state on query/sort/page/filter parameters shifts
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchParams]);

  // Debounced search sync to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (searchVal.trim()) {
        params.set("search", searchVal);
      } else {
        params.delete("search");
      }
      params.delete("page");
      params.delete("cursor");
      params.delete("direction");
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [searchVal, pathname, router]);

  // Focus restoration on closing the edit modal
  const [prevEditOpen, setPrevEditOpen] = useState(editOpen);
  useEffect(() => {
    if (prevEditOpen && !editOpen) {
      if (lastFocusedCardId.current) {
        const el = document.getElementById(`card-row-${lastFocusedCardId.current}`);
        if (el) {
          el.focus();
        }
      }
    }
    setPrevEditOpen(editOpen);
  }, [editOpen, prevEditOpen]);

  const allPageIds = initialCards.map((c) => c.id);
  const isAllSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));

  const handleToggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        allPageIds.forEach((id) => next.delete(id));
      } else {
        allPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleToggleSelectCard = useCallback((cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const handleDoubleClickCard = useCallback((card: StudyCard) => {
    setEditingCard(card);
    setDeletedAudioIds([]);
    setEditFront(card.front);
    setEditBack(card.back);
    setEditTags(card.tags?.join(", ") ?? "");
    lastFocusedCardId.current = card.id;
    setEditOpen(true);
  }, []);

  const handleSortChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    params.delete("cursor");
    params.delete("direction");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSuspendedToggle = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "suspended_only") {
      params.set("suspended", "suspended_only");
    } else {
      params.delete("suspended");
    }
    params.delete("page");
    params.delete("cursor");
    params.delete("direction");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Pagination triggers
  const handlePageNext = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (useKeyset) {
      if (nextCursor) {
        params.set("cursor", nextCursor);
        params.set("direction", "next");
        params.set("page", String(currentPage + 1));
      }
    } else {
      params.set("page", String(currentPage + 1));
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handlePagePrev = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (useKeyset) {
      if (prevCursor) {
        params.set("cursor", prevCursor);
        params.set("direction", "prev");
        params.set("page", String(currentPage - 1));
      }
    } else {
      params.set("page", String(Math.max(1, currentPage - 1)));
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  // Bulk Operations Handlers
  const executeBulkDelete = async () => {
    setIsMutating(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bulkDeleteStudyCards(ids, deckId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("bulk_actions.toast_delete_success", { count: ids.length }));
        setSelectedIds(new Set());
        router.refresh();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsMutating(false);
      setConfirmDeleteOpen(false);
    }
  };

  const executeBulkSuspend = async () => {
    setIsMutating(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bulkSuspendStudyCards(ids, deckId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("bulk_actions.toast_suspend_success", { count: ids.length }));
        setSelectedIds(new Set());
        router.refresh();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsMutating(false);
      setConfirmSuspendOpen(false);
    }
  };

  const executeBulkUnsuspend = async () => {
    setIsMutating(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await bulkUnsuspendStudyCards(ids, deckId);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("bulk_actions.toast_unsuspend_success", { count: ids.length }));
        setSelectedIds(new Set());
        router.refresh();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsMutating(false);
      setConfirmUnsuspendOpen(false);
    }
  };

  const handleOpenEdit = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 1) {
      const card = initialCards.find((c) => c.id === ids[0]);
      if (card) {
        setEditingCard(card);
        setDeletedAudioIds([]);
        setEditFront(card.front);
        setEditBack(card.back);
        setEditTags(card.tags?.join(", ") ?? "");
        lastFocusedCardId.current = card.id;
      }
    } else if (ids.length > 1) {
      setBulkAddTags("");
      setBulkRemoveTags("");
      setBulkFlagAction("no_change");
      lastFocusedCardId.current = ids[0];
    }
    setEditOpen(true);
  };

  const executeBulkUpdate = async () => {
    setIsMutating(true);
    try {
      const ids = editingCard ? [editingCard.id] : Array.from(selectedIds);
      let updates: {
        front?: string;
        back?: string;
        addTags?: string[];
        removeTags?: string[];
        isFlagged?: boolean;
      } = {};
      if (ids.length === 1) {
        updates = {
          front: editFront,
          back: editBack,
          addTags: editTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        };
      } else {
        updates = {
          addTags: bulkAddTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          removeTags: bulkRemoveTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        };
        if (bulkFlagAction === "flag") {
          updates.isFlagged = true;
        } else if (bulkFlagAction === "unflag") {
          updates.isFlagged = false;
        }
      }

      const res = await bulkUpdateStudyCards(ids, deckId, updates, deletedAudioIds);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(t("bulk_actions.toast_edit_success", { count: ids.length }));
        if (!editingCard) {
          setSelectedIds(new Set());
        }
        setDeletedAudioIds([]);
        router.refresh();
      }
    } catch {
      toast.error(tCommon("toast_save_failed"));
    } finally {
      setIsMutating(false);
      setEditOpen(false);
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    // If a modal or editor is open, do not handle list keys
    if (editOpen || confirmDeleteOpen || confirmSuspendOpen || confirmUnsuspendOpen) {
      return;
    }

    // Ignore if typing in text inputs or editable elements
    const activeEl = document.activeElement;
    if (
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.getAttribute("contenteditable") === "true")
    ) {
      return;
    }

    if (e.key === "Escape" && selectedIds.size > 0) {
      e.preventDefault();
      setSelectedIds(new Set());
    }

    if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
      e.preventDefault();
      setConfirmDeleteOpen(true);
    }
  };

  const totalPages = Math.ceil(totalCount / 100);

  // Disable Prev controls
  const prevDisabled = useKeyset 
    ? (!prevCursor || currentPage <= 1)
    : (currentPage <= 1);

  // Disable Next controls
  const nextDisabled = useKeyset
    ? (!nextCursor || initialCards.length < 100)
    : (currentPage >= totalPages);

  return (
    <div className={cn("space-y-4", selectedIds.size > 0 && "pb-24")}>
      {/* Controls: Search, Filter, Sort */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("search_placeholder")}
            className="pl-9 h-10 bg-background"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
          />
        </div>

        {/* Filter and Sort */}
        <div className="flex items-center gap-2">
          {/* Suspended Filter */}
          <Select value={currentSuspended} onValueChange={handleSuspendedToggle}>
            <SelectTrigger className="w-[160px] h-10 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filter_show_all")}</SelectItem>
              <SelectItem value="suspended_only">{t("filter_suspended_only")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort selector */}
          <Select value={currentSort} onValueChange={handleSortChange}>
            <SelectTrigger className="w-[180px] h-10 bg-background">
              <SelectValue placeholder={t("sort_label")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">{t("sort_created_desc")}</SelectItem>
              <SelectItem value="created_asc">{t("sort_created_asc")}</SelectItem>
              <SelectItem value="name_asc">{t("sort_name_asc")}</SelectItem>
              <SelectItem value="name_desc">{t("sort_name_desc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk actions status panel */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-2xl flex items-center justify-between px-4 py-3 bg-indigo-50/95 dark:bg-indigo-950/95 backdrop-blur-md border border-indigo-200 dark:border-indigo-900/50 rounded-xl shadow-lg shadow-indigo-500/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
              {t("bulk_actions.selected_plural", { count: selectedIds.size })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300"
              onClick={handleOpenEdit}
              disabled={isMutating}
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              {t("bulk_actions.edit_button")}
            </Button>
            {currentSuspended === "suspended_only" ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300"
                onClick={() => setConfirmUnsuspendOpen(true)}
                disabled={isMutating}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                {t("bulk_actions.unsuspend_button")}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300"
                onClick={() => setConfirmSuspendOpen(true)}
                disabled={isMutating}
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                {t("bulk_actions.suspend_button")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="h-8"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isMutating}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {t("bulk_actions.delete_button")}
            </Button>
          </div>
        </div>
      )}

      {/* Cards list */}
      <div 
        className="rounded-lg border bg-card overflow-hidden"
        onKeyDown={handleListKeyDown}
      >
        {/* Table Header with Select All */}
        <div className="flex items-center gap-4 px-4 py-3 bg-muted/40 border-b border-border">
          <div className="flex items-center h-5 shrink-0">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={handleToggleSelectAll}
              disabled={initialCards.length === 0}
              aria-label="Select all visible cards"
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {t("card_content_header", { defaultValue: "Card Content" })}
          </span>
        </div>

        {initialCards.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {isPending ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{tCommon("loading")}</span>
              </div>
            ) : (
              tCommon("no_data")
            )}
          </div>
        ) : (
          <div className={`divide-y transition-opacity ${isPending ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
            {initialCards.map((card) => (
              <StudyCardListItem
                key={card.id}
                card={card}
                showCheckbox={true}
                checked={selectedIds.has(card.id)}
                onCheckedChange={handleToggleSelectCard}
                onDoubleClick={handleDoubleClickCard}
                id={`card-row-${card.id}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination controls */}
      {totalCount > 100 && (
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm text-muted-foreground">
            {useKeyset
              ? t("pagination.info", { page: currentPage, totalPages: Math.ceil(totalCount / 100) })
              : t("pagination.info", { page: currentPage, totalPages })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePagePrev}
              disabled={prevDisabled || isPending}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t("pagination.prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePageNext}
              disabled={nextDisabled || isPending}
            >
              {t("pagination.next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm Bulk Delete Modal */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk_actions.delete_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("bulk_actions.delete_confirm_desc", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} disabled={isMutating}>
              {tCommon("cancel")}
            </Button>
            <Button variant="destructive" onClick={executeBulkDelete} disabled={isMutating}>
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tCommon("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Bulk Suspend Modal */}
      <Dialog open={confirmSuspendOpen} onOpenChange={setConfirmSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk_actions.suspend_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("bulk_actions.suspend_confirm_desc", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSuspendOpen(false)} disabled={isMutating}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={executeBulkSuspend} disabled={isMutating}>
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("bulk_actions.suspend_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Bulk Unsuspend Modal */}
      <Dialog open={confirmUnsuspendOpen} onOpenChange={setConfirmUnsuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bulk_actions.unsuspend_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("bulk_actions.unsuspend_confirm_desc", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmUnsuspendOpen(false)} disabled={isMutating}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={executeBulkUnsuspend} disabled={isMutating}>
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("bulk_actions.unsuspend_button")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Card(s) Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => {
        setEditOpen(open);
        if (!open) {
          setEditingCard(null);
        }
      }}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="max-h-[90vh] overflow-y-auto md:max-w-2xl w-full flex flex-col scrollbar-thin">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingCard ? t("bulk_actions.edit_title_single") : t("bulk_actions.edit_title_plural")}
            </DialogTitle>
            <DialogDescription>
              {editingCard ? t("bulk_actions.edit_desc_single") : t("bulk_actions.edit_desc_plural", { count: selectedIds.size })}
            </DialogDescription>
          </DialogHeader>

          {editingCard ? (
            // Single Edit fields
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="front">{tCommon("edit_modal_front", { defaultValue: "Front text" })}</Label>
                <RichTextEditor
                  content={editFront}
                  onChange={setEditFront}
                  placeholder="Front content..."
                  audios={editingCard?.audios}
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
                  onDelete={handleDeleteAudio}
                  editorRef={frontEditorRef}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="back">{tCommon("edit_modal_back", { defaultValue: "Back text" })}</Label>
                <RichTextEditor
                  content={editBack}
                  onChange={setEditBack}
                  placeholder="Back content..."
                  audios={editingCard?.audios}
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
                  onDelete={handleDeleteAudio}
                  editorRef={backEditorRef}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tags">{tCommon("tags", { defaultValue: "Tags (comma-separated)" })}</Label>
                <Input
                  id="tags"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="tag1, tag2..."
                />
              </div>
            </div>
          ) : (
            // Bulk Edit fields
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="bulkAddTags">{t("bulk_actions.edit_add_tags")}</Label>
                <Input
                  id="bulkAddTags"
                  value={bulkAddTags}
                  onChange={(e) => setBulkAddTags(e.target.value)}
                  placeholder="tag1, tag2..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulkRemoveTags">{t("bulk_actions.edit_remove_tags")}</Label>
                <Input
                  id="bulkRemoveTags"
                  value={bulkRemoveTags}
                  onChange={(e) => setBulkRemoveTags(e.target.value)}
                  placeholder="tag3, tag4..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulkFlag">{t("bulk_actions.edit_flag_action")}</Label>
                <Select value={bulkFlagAction} onValueChange={(val: string) => setBulkFlagAction(val as "no_change" | "flag" | "unflag")}>
                  <SelectTrigger id="bulkFlag" className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_change">{t("bulk_actions.flag_no_change")}</SelectItem>
                    <SelectItem value="flag">{t("bulk_actions.flag_add")}</SelectItem>
                    <SelectItem value="unflag">{t("bulk_actions.flag_remove")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isMutating}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={executeBulkUpdate} disabled={isMutating || (!!editingCard && !editFront.trim())}>
              {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
