"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, AlertTriangle, Archive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateDeckSettings, archiveStudyDeck, deleteStudyDeck, updateStudyDeck } from "@/actions/study-decks";
import { toast } from "sonner";
import type { DeckStudySettings } from "@/types";
import { cn } from "@/lib/utils";
import { compressToIcon, getDeckIconUrl } from "@/lib/utils/image";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import { CountryFlag } from "@/components/shared/country-flag";


const EMOJI_PRESETS = [
  "📚", "🇯🇵", "🇬🇧", "🇪🇸", "🇧🇷", "🇨🇳", "🇰🇷", "🇫🇷", "🇩🇪", "🇮🇹", "🇷🇺",
  "🧬", "💻", "🎸", "🏛️", "✏️", "🔬", "🌍", "📐", "🎯", "🧠"
];
const COLOR_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6b7280",
];

interface DeckSettingsFormProps {
  deckId: string;
  settings: DeckStudySettings | null;
  isArchived: boolean;
  deckName: string;
  deckDescription: string | null;
  deckEmoji: string | null;
  deckColor: string;
  iconType: "emoji" | "image";
  customIconPath: string | null;
}

export function DeckSettingsForm({
  deckId,
  settings,
  isArchived,
  deckName,
  deckDescription,
  deckEmoji,
  deckColor,
  iconType,
  customIconPath,
}: DeckSettingsFormProps) {
  const t = useTranslations("study.settings");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("errors");

  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Deck metadata states
  const [name, setName] = useState(deckName);
  const [description, setDescription] = useState(deckDescription ?? "");
  const [selectedEmoji, setSelectedEmoji] = useState(deckEmoji ?? "📚");
  const [selectedColor, setSelectedColor] = useState(deckColor);
  const [currentIconType, setCurrentIconType] = useState<"emoji" | "image">(iconType ?? "emoji");
  const [customIconPathState, setCustomIconPathState] = useState<string | null>(customIconPath);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(getDeckIconUrl(customIconPath));

  // SM-2 settings states
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
  const [autoplayAudioFront, setAutoplayAudioFront] = useState(settings?.autoplay_audio_front ?? true);
  const [autoplayAudioBack, setAutoplayAudioBack] = useState(settings?.autoplay_audio_back ?? true);

  const [isArchivedState, setIsArchivedState] = useState(isArchived);
  const [archivePending, startArchiveTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  function parseSteps(str: string): string[] {
    return str.trim().split(/\s+/).filter(Boolean);
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t("upload_limits"));
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("upload_limits"));
      return;
    }

    try {
      const compressed = await compressToIcon(file, 128);
      setImageBlob(compressed);
      const previewUrl = URL.createObjectURL(compressed);
      setImagePreview(previewUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("toast_error_image_processing");
      toast.error(message);
    }
  }

  async function handleRemoveImage() {
    setImageBlob(null);
    setImagePreview(null);
    if (customIconPathState) {
      const clientSupabase = createClient();
      await clientSupabase.storage.from("deck-icons").remove([customIconPathState]);
      setCustomIconPathState(null);
    }
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error(t("toast_error_name"));
      return;
    }

    if (currentIconType === "image" && !imageBlob && !customIconPathState) {
      toast.error(t("toast_error_image"));
      return;
    }

    startTransition(async () => {
      let finalPath = customIconPathState;
      const clientSupabase = createClient();

      // 1. Upload new image if selected
      if (currentIconType === "image" && imageBlob) {
        const { data: { user } } = await clientSupabase.auth.getUser();
        if (!user) {
          toast.error(tErr("auth.not_authenticated"));
          return;
        }

        const filePath = `${user.id}/${deckId}.webp`;
        const { error: uploadError } = await clientSupabase.storage
          .from("deck-icons")
          .upload(filePath, imageBlob, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadError) {
          toast.error(uploadError.message);
          return;
        }

        finalPath = `deck-icons/${filePath}`;
        setCustomIconPathState(finalPath);
        setImageBlob(null); // Clear pending upload state
      }

      // 2. Save deck customizations
      const deckResult = await updateStudyDeck(deckId, {
        name: name.trim(),
        description: description.trim() || null,
        emoji: currentIconType === "emoji" ? selectedEmoji : null,
        color: selectedColor,
        icon_type: currentIconType,
        custom_icon_path: currentIconType === "image" ? finalPath : null,
      });

      if ("error" in deckResult && deckResult.error) {
        toast.error(translateError(deckResult.error, tErr));
        return;
      }

      // 3. Save SM-2 settings
      const settingsResult = await updateDeckSettings(deckId, {
        new_cards_per_day: newPerDay,
        max_reviews_per_day: maxReviews,
        learning_steps: parseSteps(learningSteps),
        graduating_interval: graduatingInterval,
        easy_interval: easyInterval,
        relearning_steps: parseSteps(relearningSteps),
        leech_threshold: leechThreshold,
        show_confidence_bar: showConfidenceBar,
        autoplay_audio_front: autoplayAudioFront,
        autoplay_audio_back: autoplayAudioBack,
      });

      if ("error" in settingsResult && settingsResult.error) {
        toast.error(translateError(settingsResult.error, tErr));
        return;
      }

      toast.success(t("toast_saved"));
      router.refresh();
    });
  }

  function handleArchiveToggle() {
    startArchiveTransition(async () => {
      const result = await archiveStudyDeck(deckId, !isArchivedState);
      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tErr));
        return;
      }
      setIsArchivedState(!isArchivedState);
      toast.success(isArchivedState ? t("toast_unarchived") : t("toast_archived"));
      router.refresh();
    });
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteStudyDeck(deckId);
      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tErr));
        return;
      }
      toast.success(t("toast_deleted"));
      setConfirmDeleteOpen(false);
      router.push("/study");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Identity & Customization */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold">{t("identity_title")}</CardTitle>
          <CardDescription>{t("identity_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Icon picker */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("icon_style")}</Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg text-sm max-w-xs">
              <button
                type="button"
                onClick={() => setCurrentIconType("emoji")}
                className={cn(
                  "py-1.5 rounded-md font-medium transition-all text-center",
                  currentIconType === "emoji" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("emoji")}
              </button>
              <button
                type="button"
                onClick={() => setCurrentIconType("image")}
                className={cn(
                  "py-1.5 rounded-md font-medium transition-all text-center",
                  currentIconType === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("custom_image")}
              </button>
            </div>

            {currentIconType === "emoji" ? (
              <div className="flex flex-wrap gap-2">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={cn(
                      "text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                      selectedEmoji === emoji
                        ? "ring-2 ring-primary bg-primary/10 scale-110"
                        : "hover:bg-accent"
                    )}
                  >
                    <CountryFlag value={emoji} className="w-6 h-4.5 text-xl flex items-center justify-center" alt={emoji} />

                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {imagePreview ? (
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Icon preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{t("image_desc")}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={handleRemoveImage}
                      >
                        {tCommon("remove")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-4 text-center hover:bg-accent/50 transition-colors cursor-pointer relative max-w-sm">
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleImageSelect}
                    />
                    <p className="text-sm font-medium">{t("click_upload")}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("upload_limits")}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Color picker */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">{t("accent_color")}</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-all border",
                    selectedColor === color
                      ? "ring-2 ring-offset-2 ring-foreground scale-110"
                      : "hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Deck Name */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-deck-name">{t("deck_name")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-xl">
                {currentIconType === "emoji" ? (
                  selectedEmoji
                ) : imagePreview ? (
                  <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden border align-middle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                  </span>
                ) : (
                  "🖼️"
                )}
              </span>
              <Input
                id="edit-deck-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("deck_name_placeholder")}
                maxLength={200}
                required
                className="flex-1"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-deck-desc">{t("description")}</Label>
            <Textarea
              id="edit-deck-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("description_placeholder")}
              rows={3}
              maxLength={1000}
            />
          </div>
        </CardContent>
      </Card>

      {/* Daily Limits */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{t("daily_limits")}</CardTitle>
          <CardDescription>{t("daily_limits_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-per-day">{t("new_cards_day")}</Label>
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
              <Label htmlFor="max-reviews">{t("max_reviews_day")}</Label>
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
          <CardTitle className="text-base">{t("learning_steps")}</CardTitle>
          <CardDescription>{t("learning_steps_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="learning-steps">{t("learning_steps_label")}</Label>
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
              <Label htmlFor="graduating-interval">{t("graduating_interval")}</Label>
              <Input
                id="graduating-interval"
                type="number"
                min={1}
                value={graduatingInterval}
                onChange={(e) => setGraduatingInterval(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="easy-interval">{t("easy_interval")}</Label>
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
            <Label htmlFor="relearning-steps">{t("relearning_steps")}</Label>
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
          <CardTitle className="text-base">{t("leech_detection")}</CardTitle>
          <CardDescription>{t("leech_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="leech-threshold">{t("lapse_threshold")}</Label>
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
              {t("lapse_threshold_desc")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* UI Preferences */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">{t("display")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-primary"
              checked={showConfidenceBar}
              onChange={(e) => setShowConfidenceBar(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">{t("show_confidence")}</p>
              <p className="text-xs text-muted-foreground">
                {t("show_confidence_desc")}
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-primary"
              checked={autoplayAudioFront}
              onChange={(e) => setAutoplayAudioFront(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">{t("autoplay_front")}</p>
              <p className="text-xs text-muted-foreground">
                {t("autoplay_front_desc")}
              </p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-primary"
              checked={autoplayAudioBack}
              onChange={(e) => setAutoplayAudioBack(e.target.checked)}
            />
            <div>
              <p className="text-sm font-medium">{t("autoplay_back")}</p>
              <p className="text-xs text-muted-foreground">
                {t("autoplay_back_desc")}
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center gap-4">
        <Button onClick={handleSave} disabled={pending} className="w-full sm:w-auto">
          {pending ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {t("saving")}</>
          ) : (
            <><Save className="h-4 w-4 mr-1.5" /> {t("save_settings")}</>
          )}
        </Button>
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/30 bg-destructive/5 dark:bg-destructive/10">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t("danger_zone")}
          </CardTitle>
          <CardDescription>{t("danger_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-destructive/10 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium">{t("archive_title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("archive_desc")}
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
              {isArchivedState ? t("unarchive_button") : t("archive_button")}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
            <div>
              <p className="text-sm font-medium text-destructive">{t("delete_title")}</p>
              <p className="text-xs text-muted-foreground">
                {t("delete_desc")}
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deletePending}
            >
              <Trash2 className="h-4 w-4 mr-1.5" />
              {t("delete_button")}
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
              {t("delete_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {t("delete_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDeleteOpen(false)}
              disabled={deletePending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePending}
            >
              {deletePending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> {t("deleting")}</>
              ) : (
                t("delete_dialog_confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
