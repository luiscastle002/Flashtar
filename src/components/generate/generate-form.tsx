"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  Folder,
  FileText,
  Upload,
  X,
  FileSpreadsheet,
  FileImage,
  File,
  Link as LinkIcon
} from "lucide-react";
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
import { cn } from "@/lib/utils";

interface GeneratePageProps {
  plan: Plan;
  monthlyGenerations: number;
  profile: Profile | null;
}

type GenerateMode = "prompt" | "import" | "url";

const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "xlsx", "txt", "png", "jpg", "jpeg", "webp"];
const ACCEPT_ATTRIBUTE = ".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webp";

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return File;
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return FileImage;
  }
  if (["xlsx"].includes(ext)) {
    return FileSpreadsheet;
  }
  if (["docx", "pdf", "pptx", "txt"].includes(ext)) {
    return FileText;
  }
  return File;
}

export function GenerateForm({ plan, monthlyGenerations, profile }: GeneratePageProps) {
  const router = useRouter();
  const limits = PLAN_LIMITS[plan];
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [cardCount, setCardCount] = useState(20);
  const [cardType, setCardType] = useState("basic");

  // New state variables for file upload workflow
  const [mode, setMode] = useState<GenerateMode>("prompt");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(`Your plan allows up to ${maxCards} cards per deck.`);
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

  async function handleImportGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (uploadedFiles.length === 0) {
      toast.error("Please upload at least one file.");
      return;
    }

    if (uploadedFiles.length > 5) {
      toast.error("Maximum of 5 files can be uploaded per request.");
      return;
    }

    const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 4 * 1024 * 1024) {
      toast.error("Maximum combined file upload size is 4MB.");
      return;
    }

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(`Your plan allows up to ${maxCards} cards per deck.`);
      return;
    }

    if (remaining <= 0) {
      toast.error("You've reached your monthly generation limit. Upgrade to Pro for unlimited generations.");
      return;
    }

    setLoading(true);
    setProgress(20);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 92));
    }, 600);

    try {
      const formData = new FormData();
      formData.append("sourceType", "file");
      uploadedFiles.forEach((file) => {
        formData.append("files", file);
      });
      formData.append("language", language);
      formData.append("difficulty", difficulty);
      formData.append("cardCount", cardCount.toString());
      formData.append("cardType", cardType);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
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

  async function handleUrlGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (!url) {
      toast.error("Please enter a valid URL.");
      return;
    }

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(`Your plan allows up to ${maxCards} cards per deck.`);
      return;
    }

    if (remaining <= 0) {
      toast.error("You've reached your monthly generation limit. Upgrade to Pro for unlimited generations.");
      return;
    }

    setLoading(true);
    setProgress(20);

    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 12, 92));
    }, 600);

    try {
      const formData = new FormData();
      formData.append("sourceType", "url");
      formData.append("url", url);
      formData.append("language", language);
      formData.append("difficulty", difficulty);
      formData.append("cardCount", cardCount.toString());
      formData.append("cardType", cardType);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Detect if the drop event contains URLs or text formats
    const types = Array.from(e.dataTransfer.types || []);
    const hasUrl = types.includes("text/uri-list") || types.includes("text/plain") || types.includes("text/html");
    
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const hasFiles = files.length > 0;

    // TODO: This drag-and-drop URL detection will evolve into the new "Import URL" feature.
    // 1. If no files are present and a URL/text type is detected, show the toast and abort file processing.
    if (hasUrl && !hasFiles) {
      toast.error("Use URL panel instead.");
      return;
    }

    // 2. If both files and URLs are dropped simultaneously, process supported files normally but show the message.
    if (hasUrl && hasFiles) {
      toast.error("Use URL panel instead.");
    }

    if (hasFiles) {
      const validFiles = files.filter((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext && ALLOWED_EXTENSIONS.includes(ext);
      });

      if (validFiles.length < files.length) {
        toast.error("This file type is not supported.");
      }

      if (validFiles.length > 0) {
        if (uploadedFiles.length + validFiles.length > 5) {
          toast.error("Maximum of 5 files can be uploaded per request.");
          return;
        }

        const totalSize = [...uploadedFiles, ...validFiles].reduce((sum, f) => sum + f.size, 0);
        if (totalSize > 4 * 1024 * 1024) {
          toast.error("Maximum combined file upload size is 4MB.");
          return;
        }

        setUploadedFiles((prev) => [...prev, ...validFiles]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext && ALLOWED_EXTENSIONS.includes(ext);
      });

      if (validFiles.length < files.length) {
        toast.error("This file type is not supported.");
      }

      if (validFiles.length > 0) {
        if (uploadedFiles.length + validFiles.length > 5) {
          toast.error("Maximum of 5 files can be uploaded per request.");
          return;
        }

        const totalSize = [...uploadedFiles, ...validFiles].reduce((sum, f) => sum + f.size, 0);
        if (totalSize > 4 * 1024 * 1024) {
          toast.error("Maximum combined file upload size is 4MB.");
          return;
        }

        setUploadedFiles((prev) => [...prev, ...validFiles]);
      }
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const renderSettings = () => (
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
  );

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

        {/* Tab Selector */}
        <div className="flex p-1 bg-card/70 backdrop-blur-md rounded-xl border border-border/50 max-w-md shadow-md">
          <button
            type="button"
            onClick={() => setMode("prompt")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer select-none",
              mode === "prompt"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Sparkles className="h-4 w-4" />
            Prompt
          </button>
          <button
            type="button"
            onClick={() => setMode("import")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer select-none",
              mode === "import"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <Folder className="h-4 w-4" />
            Import Files
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer select-none",
              mode === "url"
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
          >
            <LinkIcon className="h-4 w-4" />
            Import URL
          </button>
        </div>

        <div className="transition-all duration-300">
          {mode === "prompt" ? (
            <Card className="transition-all duration-300">
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

                  {renderSettings()}

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
          ) : mode === "import" ? (
            <Card className="transition-all duration-300">
              <CardHeader>
                <CardTitle>Import Files</CardTitle>
                <CardDescription>
                  Upload documents, text files, or images and AI will generate flashcards automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleImportGenerate} className="space-y-6">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center transition-all duration-300 cursor-pointer select-none",
                      isDragging
                        ? "border-primary bg-primary/10 scale-[0.99]"
                        : "border-border/60 hover:border-primary/50 bg-muted/20 hover:bg-muted/40"
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept={ACCEPT_ATTRIBUTE}
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={loading}
                    />
                    <div className="p-3 bg-background/80 rounded-full border border-border shadow-sm">
                      <Upload className={cn("h-6 w-6 text-muted-foreground transition-colors", isDragging && "text-primary")} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Drag and drop files here or <span className="text-primary hover:underline">click to browse</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported formats: PDF, Word, Excel, PowerPoint, Images, Text (.txt)
                      </p>
                    </div>
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                      {uploadedFiles.map((file, idx) => {
                        const Icon = getFileIcon(file.name);
                        return (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/50 backdrop-blur-sm transition-all hover:bg-card/85"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-background/60 rounded-md border border-border/30">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-[320px]">
                                  {file.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(idx);
                              }}
                              disabled={loading}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="space-y-4 border-t pt-6">
                    <h3 className="text-sm font-semibold">Settings</h3>
                    {renderSettings()}
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

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loading || uploadedFiles.length === 0}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate From Files
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="transition-all duration-300">
              <CardHeader>
                <CardTitle>Import URL</CardTitle>
                <CardDescription>
                  Enter a web page or YouTube link and AI will generate flashcards automatically.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUrlGenerate} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="url-input">URL</Label>
                    <Input
                      id="url-input"
                      type="url"
                      placeholder="https://example.com/article-to-learn-from"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      YouTube videos, articles, and documentation pages are supported.
                    </p>
                  </div>

                  <div className="space-y-4 border-t pt-6">
                    <h3 className="text-sm font-semibold">Settings</h3>
                    {renderSettings()}
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

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loading || !url}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate From URL
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

