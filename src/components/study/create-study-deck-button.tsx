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
import { createStudyDeck } from "@/actions/study-decks";
import { toast } from "sonner";
import type { canCreateStudyDeck } from "@/lib/queries/user";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    startTransition(async () => {
      const result = await createStudyDeck({
        name: name.trim(),
        description: description.trim() || undefined,
        emoji: selectedEmoji,
        color: selectedColor,
      });

      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Study deck created!");
      setOpen(false);
      setName("");
      setDescription("");
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
    <Dialog open={open} onOpenChange={setOpen}>
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
          {/* Emoji picker */}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Icon</Label>
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
              <span className="text-xl">{selectedEmoji}</span>
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
            <Button type="submit" disabled={!name.trim() || pending}>
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
