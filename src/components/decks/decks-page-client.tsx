"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Copy, Trash2, Layers } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDeck, deleteDeck, duplicateDeck } from "@/actions/decks";
import { formatDate, pluralize } from "@/lib/utils";
import { toast } from "sonner";
import type { Deck, Profile } from "@/types";

interface DecksPageClientProps {
  decks: Deck[];
  profile: Profile | null;
}

export function DecksPageClient({ decks: initialDecks, profile }: DecksPageClientProps) {
  const [decks, setDecks] = useState(initialDecks);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    return decks.filter((deck) => {
      const matchesSearch =
        deck.name.toLowerCase().includes(search.toLowerCase()) ||
        deck.description?.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === "all" || deck.card_type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [decks, search, filter]);

  async function handleCreate(formData: FormData) {
    setCreating(true);
    const result = await createDeck({
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || undefined,
    });
    setCreating(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      setDecks((prev) => [result.data!, ...prev]);
      setDialogOpen(false);
      toast.success("Deck created!");
    }
  }

  async function handleDuplicate(deckId: string) {
    const result = await duplicateDeck(deckId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.data) {
      setDecks((prev) => [result.data!, ...prev]);
      toast.success("Deck duplicated!");
    }
  }

  async function handleDelete(deckId: string) {
    if (!confirm("Are you sure you want to delete this deck?")) return;
    const result = await deleteDeck(deckId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setDecks((prev) => prev.filter((d) => d.id !== deckId));
    toast.success("Deck deleted");
  }

  return (
    <DashboardShell currentPath="/decks" profile={profile}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">My Decks</h1>
            <p className="text-muted-foreground">{decks.length} {pluralize(decks.length, "deck")}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                New Deck
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Deck</DialogTitle>
              </DialogHeader>
              <form action={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Deck Name</Label>
                  <Input id="name" name="name" required placeholder="My Flashcards" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea id="description" name="description" placeholder="What is this deck about?" />
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? "Creating..." : "Create Deck"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search decks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
              <SelectItem value="cloze">Cloze</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <Card>
            <div className="py-16 text-center">
              <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {search || filter !== "all" ? "No decks match your search." : "No decks yet."}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((deck) => (
              <Card key={deck.id} className="group relative">
                <Link href={`/decks/${deck.id}`}>
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{deck.name}</CardTitle>
                    <CardDescription>
                      {deck.flashcard_count ?? 0} {pluralize(deck.flashcard_count ?? 0, "card")} ·{" "}
                      {formatDate(deck.updated_at)}
                    </CardDescription>
                    {deck.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{deck.description}</p>
                    )}
                  </CardHeader>
                </Link>
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDuplicate(deck.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(deck.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
