"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronLeft, ChevronRight, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { StudyCardListItem } from "./study-card-list-item";
import { bulkDeleteStudyCards, bulkSuspendStudyCards, bulkUnsuspendStudyCards } from "@/actions/imports";
import type { StudyCard } from "@/types";

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
  const [isMutating, setIsMutating] = useState(false);

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

  const handleToggleSelectCard = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  };

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
    <div className="space-y-4">
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
        <div className="flex items-center justify-between px-4 py-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 rounded-lg animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
              {t("bulk_actions.selected_plural", { count: selectedIds.size })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {currentSuspended === "suspended_only" ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300"
                onClick={() => setConfirmUnsuspendOpen(true)}
                disabled={isMutating}
              >
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
      <div className="rounded-lg border bg-card overflow-hidden">
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
                onCheckedChange={() => handleToggleSelectCard(card.id)}
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
    </div>
  );
}
