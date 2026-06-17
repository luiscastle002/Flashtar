"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createStudyDeck, updateStudyDeck } from "@/actions/study-decks";
import { toast } from "sonner";
import type { canCreateStudyDeck } from "@/lib/queries/user";
import { cn } from "@/lib/utils";
import { compressToIcon } from "@/lib/utils/image";
import { createClient } from "@/lib/supabase/client";

const EMOJI_PRESETS = ["📚", "🇯🇵", "🧬", "💻", "🎸", "🏛️", "✏️", "🔬", "🌍", "📐", "🎯", "🧠"];
const COLOR_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#6b7280",
];

interface CreateStudyDeckButtonProps {
  gate: Awaited<ReturnType<typeof canCreateStudyDeck>>;
  className?: string;
}

export function CreateStudyDeckButton({ gate, className }: CreateStudyDeckButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("📚");
  const [selectedColor, setSelectedColor] = useState("#6366f1");

  const [iconType, setIconType] = useState<"emoji" | "image">("emoji");
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size exceeds 5MB limit.");
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Unsupported file format. Please upload PNG, JPG, or WEBP.");
      return;
    }

    try {
      const compressed = await compressToIcon(file, 128);
      setImageBlob(compressed);
      const previewUrl = URL.createObjectURL(compressed);
      setImagePreview(previewUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error processing image.";
      toast.error(message);
    }
  }

  function handleRemoveImage() {
    setImageBlob(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (iconType === "image" && !imageBlob) {
      toast.error("Please upload an image or switch to emoji icon.");
      return;
    }

    startTransition(async () => {
      // 1. Create the study deck in database
      const result = await createStudyDeck({
        name: name.trim(),
        description: description.trim() || undefined,
        emoji: iconType === "emoji" ? selectedEmoji : undefined,
        color: selectedColor,
        icon_type: iconType,
        custom_icon_path: null,
      });

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      const deck = result.data;
      if (!deck) {
        toast.error("Failed to create study deck.");
        return;
      }

      // 2. If image upload was selected, upload and then update path
      if (iconType === "image" && imageBlob) {
        const clientSupabase = createClient();
        const { data: { user } } = await clientSupabase.auth.getUser();
        if (!user) {
          toast.error("User session not found. Image could not be uploaded.");
          return;
        }

        const filePath = `${user.id}/${deck.id}.webp`;
        const { error: uploadError } = await clientSupabase.storage
          .from("deck-icons")
          .upload(filePath, imageBlob, {
            contentType: "image/webp",
            upsert: true,
          });

        if (uploadError) {
          toast.error(`Image upload failed: ${uploadError.message}. Falling back to default icon.`);
        } else {
          // Update the database record with the custom_icon_path
          const updateResult = await updateStudyDeck(deck.id, {
            custom_icon_path: `deck-icons/${filePath}`,
          });
          if ("error" in updateResult && updateResult.error) {
            toast.error(`Failed to save icon path: ${updateResult.error}`);
          }
        }
      }

      toast.success("Study deck created!");
      setOpen(false);
      setName("");
      setDescription("");
      setIconType("emoji");
      handleRemoveImage();
      router.refresh();
    });
  }

  if (!gate.allowed) {
    return (
      <Button variant="outline" disabled className={className}>
        <Plus className="h-4 w-4 mr-1.5" />
        New Deck
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setName("");
        setDescription("");
        setIconType("emoji");
        handleRemoveImage();
      }
    }}>
      <DialogTrigger asChild>
        <Button className={className}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Deck
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create study deck</DialogTitle>
          <DialogDescription>
            Give your deck a name and personality. You can add cards after creating it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Icon picker */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground block">Icon Style</Label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg text-sm">
              <button
                type="button"
                onClick={() => setIconType("emoji")}
                className={cn(
                  "py-1.5 rounded-md font-medium transition-all text-center",
                  iconType === "emoji" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Emoji
              </button>
              <button
                type="button"
                onClick={() => setIconType("image")}
                className={cn(
                  "py-1.5 rounded-md font-medium transition-all text-center",
                  iconType === "image" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Custom Image
              </button>
            </div>

            {iconType === "emoji" ? (
              <div className="flex flex-wrap gap-2">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setSelectedEmoji(emoji)}
                    className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                      selectedEmoji === emoji
                        ? "ring-2 ring-primary bg-primary/10 scale-110"
                        : "hover:bg-accent"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {imagePreview ? (
                  <div className="flex items-center gap-3">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-muted flex items-center justify-center shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Icon ready to upload (128x128px WebP)</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={handleRemoveImage}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-4 text-center hover:bg-accent/50 transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={handleImageSelect}
                    />
                    <p className="text-sm font-medium">Click to upload image</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, or WEBP (Max 5MB)</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Color picker */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Accent color</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    selectedColor === color
                      ? "ring-2 ring-offset-2 ring-foreground scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="deck-name">Name *</Label>
            <div className="flex items-center gap-2">
              <span className="text-xl">
                {iconType === "emoji" ? (
                  selectedEmoji
                ) : imagePreview ? (
                  <span className="relative inline-block w-6 h-6 rounded-full overflow-hidden border align-middle">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview} alt="Icon Preview" className="w-full h-full object-cover" />
                  </span>
                ) : (
                  "🖼️"
                )}
              </span>
              <Input
                id="deck-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Japanese Vocabulary"
                maxLength={200}
                autoFocus
                required
                className="flex-1"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="deck-desc">Description <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              id="deck-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will you study in this deck?"
              rows={2}
              maxLength={1000}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending || (iconType === "image" && !imageBlob)}>
              {pending ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Creating…</>
              ) : (
                "Create Deck"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
