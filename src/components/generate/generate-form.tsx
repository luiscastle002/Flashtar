"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { Plan, Profile } from "@/types";
import { PLAN_LIMITS } from "@/types";

interface GeneratePageProps {
  plan: Plan;
  monthlyGenerations: number;
  profile: Profile | null;
}

export function GenerateForm({ plan, monthlyGenerations, profile }: GeneratePageProps) {
  const router = useRouter();
  const limits = PLAN_LIMITS[plan];
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [language, setLanguage] = useState("English");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [cardCount, setCardCount] = useState(20);
  const [cardType, setCardType] = useState("basic");

  const remaining =
    limits.monthlyGenerations === Infinity
      ? Infinity
      : limits.monthlyGenerations - monthlyGenerations;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (prompt.length < 10) {
      toast.error("Please enter a more detailed prompt (at least 10 characters).");
      return;
    }

    if (cardCount > limits.maxCardsPerDeck) {
      toast.error(`Your plan allows up to ${limits.maxCardsPerDeck} cards per deck.`);
      return;
    }

    if (remaining <= 0) {
      toast.error("You've reached your monthly generation limit. Upgrade to Pro for unlimited generations.");
      return;
    }

    setLoading(true);
    setProgress(20);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 10, 90));
    }, 800);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, language, difficulty, cardCount, cardType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setProgress(100);
      toast.success(`Generated ${data.cardCount} flashcards!`);
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Generation failed");
    } finally {
      clearInterval(interval);
      setLoading(false);
      setProgress(0);
    }
  }

  return (
    <DashboardShell currentPath="/generate" profile={profile}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            Generate Deck
          </h1>
          <p className="text-muted-foreground">
            Describe what you want to learn and AI will create a complete flashcard deck.
          </p>
        </div>

        {remaining !== Infinity && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>Monthly generations remaining</span>
                <span className="font-medium">{remaining} of {limits.monthlyGenerations}</span>
              </div>
              <Progress
                value={(monthlyGenerations / limits.monthlyGenerations) * 100}
                className="h-2"
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Deck Settings</CardTitle>
            <CardDescription>Configure your AI-generated flashcard deck</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea
                  id="prompt"
                  placeholder="Create a deck of 50 flashcards about JavaScript closures..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  required
                  disabled={loading}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={setLanguage} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["English", "Spanish", "French", "German", "Portuguese", "Japanese", "Chinese"].map(
                        (lang) => (
                          <SelectItem key={lang} value={lang}>
                            {lang}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner</SelectItem>
                      <SelectItem value="intermediate">Intermediate</SelectItem>
                      <SelectItem value="advanced">Advanced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardCount">Number of Cards</Label>
                  <Input
                    id="cardCount"
                    type="number"
                    min={1}
                    max={limits.maxCardsPerDeck}
                    value={cardCount}
                    onChange={(e) => setCardCount(Number(e.target.value))}
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground">Max {limits.maxCardsPerDeck} on your plan</p>
                </div>

                <div className="space-y-2">
                  <Label>Card Type</Label>
                  <Select value={cardType} onValueChange={setCardType} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Basic Front/Back</SelectItem>
                      <SelectItem value="cloze">Cloze Deletion</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating flashcards with AI...
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Deck
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
