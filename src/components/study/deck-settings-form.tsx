"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, AlertTriangle, Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateDeckSettings, archiveStudyDeck, deleteStudyDeck } from "@/actions/study-decks";
import { toast } from "sonner";
import type { DeckStudySettings } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeckSettingsFormProps {
  deckId: string;
  settings: DeckStudySettings | null;
  isArchived: boolean;
}

export function DeckSettingsForm({ deckId, settings, isArchived }: DeckSettingsFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newPerDay, setNewPerDay] = useState(settings?.new_cards_per_day ?? 20);
  const [maxReviews, setMaxReviews] = useState(settings?.max_reviews_per_day ?? 200);
  const [learningSteps, setLearningSteps] = useState(
    (settings?.learning_steps ?? ["1m", "10m"]).join(" ")
  );
  const [graduatingInterval, setGraduatingInterval] = useState(settings?.graduating_interval ?? 1);
  const [easyInterval, setEasyInterval] = useState(settings?.easy_interval ?? 4);
  const [relearningSteps, setRelearningSteps] = useState(
    (settings?.relearning_steps ?? ["10m"]).join(" ")
  );
  const [leechThreshold, setLeechThreshold] = useState(settings?.leech_threshold ?? 8);
  const [showConfidenceBar, setShowConfidenceBar] = useState(settings?.show_confidence_bar ?? true);

  const [isArchivedState, setIsArchivedState] = useState(isArchived);
  const [archivePending, startArchiveTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  function parseSteps(str: string): string[] {
    return str.trim().split(/\s+/).filter(Boolean);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateDeckSettings(deckId, {
        new_cards_per_day: newPerDay,
        max_reviews_per_day: maxReviews,
        learning_steps: parseSteps(learningSteps),
        graduating_interval: graduatingInterval,
        easy_interval: easyInterval,
        relearning_steps: parseSteps(relearningSteps),
        leech_threshold: leechThreshold,
        show_confidence_bar: showConfidenceBar,
      });

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  function handleArchiveToggle() {
    startArchiveTransition(async () => {
      const result = await archiveStudyDeck(deckId, !isArchivedState);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setIsArchivedState(!isArchivedState);
      toast.success(isArchivedState ? "Deck unarchived" : "Deck archived");
      router.refresh();
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteStudyDeck(deckId);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Deck deleted");
      setConfirmDeleteOpen(false);
      router.push("/study");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Daily Limits */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Daily Limits</CardTitle>
          <CardDescription>Control how many cards you study each day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-per-day">New cards/day</Label>
              <Input
                id="new-per-day"
                type="number"
                min={0}
                max={9999}
                value={newPerDay}
                onChange={(e) => setNewPerDay(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max-reviews">Max reviews/day</Label>
              <Input
                id="max-reviews"
                type="number"
                min={0}
                max={9999}
                value={maxReviews}
                onChange={(e) => setMaxReviews(Number(e.target.value))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Learning Steps */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Learning Steps</CardTitle>
          <CardDescription>
            Space-separated intervals for new cards (e.g. <code className="font-mono text-xs bg-muted px-1 rounded">1m 10m</code>).
            Supported units: <code className="font-mono text-xs bg-muted px-1 rounded">m</code> (minutes),{" "}
            <code className="font-mono text-xs bg-muted px-1 rounded">h</code> (hours),{" "}
            <code className="font-mono text-xs bg-muted px-1 rounded">d</code> (days).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="learning-steps">Learning steps</Label>
            <Input
              id="learning-steps"
              value={learningSteps}
              onChange={(e) => setLearningSteps(e.target.value)}
              placeholder="1m 10m"
              className="font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="graduating-interval">Graduating interval (days)</Label>
              <Input
                id="graduating-interval"
                type="number"
                min={1}
                value={graduatingInterval}
                onChange={(e) => setGraduatingInterval(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="easy-interval">Easy interval (days)</Label>
              <Input
                id="easy-interval"
                type="number"
                min={1}
                value={easyInterval}
                onChange={(e) => setEasyInterval(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="relearning-steps">Relearning steps (after lapse)</Label>
            <Input
              id="relearning-steps"
              value={relearningSteps}
              onChange={(e) => setRelearningSteps(e.target.value)}
              placeholder="10m"
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Leech Detection */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Leech Detection</CardTitle>
          <CardDescription>Cards failed too many times are flagged as leeches.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="leech-threshold">Lapse threshold</Label>
            <Input
              id="leech-threshold"
              type="number"
              min={1}
              max={50}
              value={leechThreshold}
              onChange={(e) => setLeechThreshold(Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Card will be suspended after this many lapses.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* UI Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Display</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-primary"
              checked={showConfidenceBar}
              onChange={(e) => setShowConfidenceBar(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">Show confidence bar</p>
              <p className="text-xs text-muted-foreground">
                Use the gradient confidence bar instead of Again / Hard / Good / Easy buttons.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center gap-4">
        <Button onClick={handleSave} disabled={pending} className="w-full sm:w-auto">
          {pending ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Saving…</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" /> Save Settings</>
          )}
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Actions here are destructive or modify the deck status.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-destructive/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">Archive study deck</p>
              <p className="text-xs text-muted-foreground">
                Archived decks are hidden from the daily study lists but saved.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleArchiveToggle}
              disabled={archivePending}
            >
              {archivePending ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Archive className="h-4 w-4 mr-1.5" />
              )}
              {isArchivedState ? "Unarchive Deck" : "Archive Deck"}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
            <div>
              <p className="text-sm font-medium text-destructive">Delete study deck</p>
              <p className="text-xs text-muted-foreground">
                Permanently delete this study deck, its configuration, and all its cards.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deletePending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              Delete Deck
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Study Deck?
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this study deck? This will delete all flashcards, progress, and review logs associated with it. This action is irreversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting…</>
              ) : (
                "Delete Permanently"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
