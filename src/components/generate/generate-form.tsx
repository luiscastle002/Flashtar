"use client";

import { useState, useRef, useEffect, useOptimistic, useTransition } from "react";
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
  Link as LinkIcon,
  SlidersHorizontal,
  Trash2,
  Star,
  Pin
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import type { Plan, Profile, SavedPrompt } from "@/types";
import { PLAN_LIMITS } from "@/types";
import { cn } from "@/lib/utils";
import {
  createSavedPrompt,
  updateSavedPrompt,
  deleteSavedPrompt,
} from "@/actions/prompts";

interface GeneratePageProps {
  plan: Plan;
  monthlyGenerations: number;
  profile: Profile | null;
  initialPrompts: SavedPrompt[];
}

type GenerateMode = "prompt" | "import" | "url";

type GenerationState =
  | "idle"
  | "uploading"
  | "processing"
  | "redirecting"
  | "error";

const STATUS_MESSAGES = [
  "🧠 Reading your files...",
  "📝 Extracting text...",
  "✨ Generating flashcards...",
  "📚 Preparing your deck...",
];

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ deck: { id: string }; cardCount: number; generationId: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        onProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch {
          reject(new Error("Failed to parse response"));
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          reject(new Error(response.error ?? `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred"));
    };

    xhr.send(formData);
  });
}

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

export function GenerateForm({ plan, monthlyGenerations, profile, initialPrompts }: GeneratePageProps) {
  const router = useRouter();
  const limits = PLAN_LIMITS[plan];
  const [generationState, setGenerationState] = useState<GenerationState>("idle");
  const loading = generationState !== "idle";
  const [progress, setProgress] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

  useEffect(() => {
    if (generationState !== "processing") {
      setCurrentMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [generationState]);

  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [cardCount, setCardCount] = useState(20);
  const [cardType, setCardType] = useState("basic");

  // Custom instructions & Configuration Dialog states
  const [customInstructions, setCustomInstructions] = useState("");
  const [tempInstructions, setTempInstructions] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [isPending, startTransition] = useTransition();

  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>(initialPrompts);
  type OptimisticAction =
    | { type: "add"; payload: SavedPrompt }
    | { type: "delete"; payload: string }
    | { type: "update"; payload: { id: string; updates: Partial<Omit<SavedPrompt, "id" | "user_id" | "created_at" | "updated_at">> } };

  const [optimisticPrompts, setOptimisticPrompts] = useOptimistic(
    savedPrompts,
    (state, action: OptimisticAction) => {
      switch (action.type) {
        case "add":
          return [action.payload, ...state];
        case "delete":
          return state.filter((p) => p.id !== action.payload);
        case "update":
          return state.map((p) => {
            if (p.id === action.payload.id) {
              return { ...p, ...action.payload.updates };
            }
            if (action.payload.updates.is_default && p.id !== action.payload.id) {
              return { ...p, is_default: false };
            }
            return p;
          });
        default:
          return state;
      }
    }
  );

  // Load local preferences and default prompt on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem("flashtar_pref_language");
    const savedDifficulty = localStorage.getItem("flashtar_pref_difficulty");
    if (savedLanguage) setLanguage(savedLanguage);
    if (savedDifficulty) setDifficulty(savedDifficulty);

    const defaultPrompt = initialPrompts.find((p) => p.is_default);
    if (defaultPrompt) {
      setCustomInstructions(defaultPrompt.content);
    }
  }, [initialPrompts]);

  const handleLanguageChange = (val: string) => {
    setLanguage(val);
    localStorage.setItem("flashtar_pref_language", val);
  };

  const handleDifficultyChange = (val: string) => {
    setDifficulty(val);
    localStorage.setItem("flashtar_pref_difficulty", val);
  };

  const handleOpenConfig = () => {
    setTempInstructions(customInstructions);
    setNewPromptName("");
    setConfigOpen(true);
  };

  const handleCloseConfig = (open: boolean) => {
    if (!open) {
      if (tempInstructions !== customInstructions) {
        if (!confirm("You have unsaved changes in AI Instructions. Discard them?")) {
          return;
        }
      }
    }
    setConfigOpen(open);
  };

  const handleApplyConfig = () => {
    if (tempInstructions.length > 2000) {
      toast.error("AI Instructions cannot exceed 2000 characters");
      return;
    }
    setCustomInstructions(tempInstructions);
    setConfigOpen(false);
    toast.success("Configuration applied");
  };

  // CRUD actions using server actions with optimistic updates
  const handleDeletePrompt = async (id: string) => {
    startTransition(async () => {
      setOptimisticPrompts({ type: "delete", payload: id });
      const res = await deleteSavedPrompt(id);
      if (res && "error" in res) {
        toast.error(res.error);
      } else {
        setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
        toast.success("Prompt deleted");
      }
    });
  };

  const handleToggleFavorite = async (promptItem: SavedPrompt) => {
    const newFav = !promptItem.is_favorite;
    startTransition(async () => {
      setOptimisticPrompts({ type: "update", payload: { id: promptItem.id, updates: { is_favorite: newFav } } });
      const res = await updateSavedPrompt(promptItem.id, { is_favorite: newFav });
      if (res && "error" in res) {
        toast.error(res.error);
      } else if (res.data) {
        setSavedPrompts((prev) => prev.map((p) => (p.id === promptItem.id ? res.data : p)));
      }
    });
  };

  const handleToggleDefault = async (promptItem: SavedPrompt) => {
    const newDefault = !promptItem.is_default;
    startTransition(async () => {
      setOptimisticPrompts({ type: "update", payload: { id: promptItem.id, updates: { is_default: newDefault } } });
      const res = await updateSavedPrompt(promptItem.id, { is_default: newDefault });
      if (res && "error" in res) {
        toast.error(res.error);
      } else if (res.data) {
        setSavedPrompts((prev) => {
          return prev.map((p) => {
            if (p.id === promptItem.id) return res.data;
            if (newDefault) return { ...p, is_default: false };
            return p;
          });
        });
      }
    });
  };

  const handleCreatePrompt = async () => {
    if (!newPromptName.trim()) {
      toast.error("Please enter a name for the prompt");
      return;
    }
    if (!tempInstructions.trim()) {
      toast.error("AI Instructions are empty");
      return;
    }
    if (tempInstructions.length > 5000) {
      toast.error("Instructions cannot exceed 5000 characters to save");
      return;
    }

    const tempId = Math.random().toString();
    const newPromptPlaceholder: SavedPrompt = {
      id: tempId,
      user_id: profile?.id ?? "",
      name: newPromptName.trim(),
      content: tempInstructions.trim(),
      is_favorite: false,
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    startTransition(async () => {
      setOptimisticPrompts({ type: "add", payload: newPromptPlaceholder });
      const res = await createSavedPrompt(newPromptName.trim(), tempInstructions.trim());
      if (res && "error" in res) {
        toast.error(res.error);
      } else if (res.data) {
        setSavedPrompts((prev) => [res.data, ...prev]);
        setNewPromptName("");
        toast.success("Prompt saved");
      }
    });
  };

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

    setGenerationState("processing");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, language, difficulty, cardCount, cardType, customInstructions }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGenerationState("redirecting");
      toast.success(`Generated ${data.cardCount} flashcards!`);
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      toast.error(error instanceof Error ? error.message : "Generation failed");
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

    setGenerationState("uploading");
    setProgress(0);

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
      if (customInstructions) {
        formData.append("customInstructions", customInstructions);
      }

      const data = await uploadWithProgress("/api/generate", formData, (percent) => {
        setProgress(percent);
        if (percent >= 100) {
          setGenerationState("processing");
        }
      });

      setGenerationState("redirecting");
      toast.success(`Generated ${data.cardCount} flashcards!`);
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      setProgress(0);
      toast.error(error instanceof Error ? error.message : "Generation failed");
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

    setGenerationState("processing");

    try {
      const formData = new FormData();
      formData.append("sourceType", "url");
      formData.append("url", url);
      formData.append("language", language);
      formData.append("difficulty", difficulty);
      formData.append("cardCount", cardCount.toString());
      formData.append("cardType", cardType);
      if (customInstructions) {
        formData.append("customInstructions", customInstructions);
      }

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGenerationState("redirecting");
      toast.success(`Generated ${data.cardCount} flashcards!`);
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      toast.error(error instanceof Error ? error.message : "Generation failed");
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

    const types = Array.from(e.dataTransfer.types || []);
    const hasUrl = types.includes("text/uri-list") || types.includes("text/plain") || types.includes("text/html");
    
    const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const hasFiles = files.length > 0;

    if (hasUrl && !hasFiles) {
      toast.error("Use URL panel instead.");
      return;
    }

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

  // Compact layout: main controls (Card Type, Card Count)
  const renderMainControls = () => (
    <div className="grid sm:grid-cols-2 gap-4">
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

                  {renderMainControls()}

                  <div className="grid grid-cols-1 gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-sm font-medium"
                      onClick={handleOpenConfig}
                      disabled={loading}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Configuration
                      {customInstructions.trim() && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Button>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base" size="lg" disabled={loading}>
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

                  {renderMainControls()}

                  <div className="grid grid-cols-1 gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-sm font-medium"
                      onClick={handleOpenConfig}
                      disabled={loading}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Configuration
                      {customInstructions.trim() && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Button>
                  </div>

                  {generationState === "uploading" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading files ({progress}%)...
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 text-base"
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

                  {renderMainControls()}

                  <div className="grid grid-cols-1 gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-11 text-sm font-medium"
                      onClick={handleOpenConfig}
                      disabled={loading}
                    >
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Configuration
                      {customInstructions.trim() && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base"
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

      {/* Configuration Panel Modal (Radix Dialog) */}
      <Dialog open={configOpen} onOpenChange={handleCloseConfig}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generation Configuration</DialogTitle>
            <DialogDescription>
              Customize system instructions and deck configurations.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* AI Custom Instructions */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="custom-instructions">AI Instructions</Label>
                <span className={cn(
                  "text-xs text-muted-foreground",
                  tempInstructions.length > 2000 && "text-destructive font-medium"
                )}>
                  {tempInstructions.length}/2000
                </span>
              </div>
              <Textarea
                id="custom-instructions"
                placeholder="Examples:&#13;• Focus heavily on specific terms and direct definitions.&#13;• Structure questions like college exam items.&#13;• Avoid basic trivia; prioritize deep conceptual links.&#13;• Translate and include phonetic spelling on the back."
                value={tempInstructions}
                onChange={(e) => setTempInstructions(e.target.value)}
                rows={5}
                className="resize-none"
              />
            </div>

            {/* Language & Difficulty Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={handleLanguageChange}>
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
                <Select value={difficulty} onValueChange={handleDifficultyChange}>
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
            </div>

            {/* Saved Prompt Manager */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold tracking-tight">Saved Prompt Templates</h3>

              {/* Inline Save Prompt Action */}
              <div className="flex gap-2">
                <Input
                  placeholder="Save current instructions as name..."
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCreatePrompt}
                  disabled={isPending || !tempInstructions.trim()}
                >
                  Save Current
                </Button>
              </div>

              {/* Saved Prompts list */}
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {optimisticPrompts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No custom templates saved yet. Write instructions above and save to repeat them.
                  </p>
                ) : (
                  optimisticPrompts.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-lg border border-border/60 text-sm bg-muted/30 transition-colors hover:bg-muted/70",
                        p.is_default && "border-primary bg-primary/5 hover:bg-primary/5"
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs truncate max-w-[150px]">{p.name}</span>
                          {p.is_default && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Default</span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[280px]">
                          {p.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Load template */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs font-semibold hover:bg-background/80"
                          onClick={() => {
                            setTempInstructions(p.content);
                            toast.success(`Loaded prompt template: ${p.name}`);
                          }}
                        >
                          Load
                        </Button>

                        {/* Favorite button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 text-muted-foreground hover:text-amber-500 hover:bg-background/80",
                            p.is_favorite && "text-amber-500 fill-amber-500"
                          )}
                          onClick={() => handleToggleFavorite(p)}
                        >
                          <Star className="h-3.5 w-3.5" />
                        </Button>

                        {/* Set default button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-7 w-7 text-muted-foreground hover:text-primary hover:bg-background/80",
                            p.is_default && "text-primary fill-primary"
                          )}
                          onClick={() => handleToggleDefault(p)}
                          title={p.is_default ? "Primary default instruction" : "Set as default prompt"}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </Button>

                        {/* Delete button */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-background/80"
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete "${p.name}"?`)) {
                              handleDeletePrompt(p.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCloseConfig(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleApplyConfig}
              disabled={tempInstructions.length > 2000}
            >
              Apply Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-screen processing overlay */}
      {(generationState === "processing" || generationState === "redirecting") && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md transition-all duration-300 animate-in fade-in">
          <div className="max-w-md w-full mx-auto px-6 flex flex-col items-center text-center space-y-6">
            <div className="relative flex items-center justify-center">
              {/* Outer glowing ring */}
              <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl animate-pulse h-24 w-24 -m-4" />
              <div className="relative p-6 bg-card rounded-full border border-border shadow-lg">
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground transition-all duration-300 min-h-[2.5rem]">
                {generationState === "redirecting" 
                  ? "📚 Opening your deck..." 
                  : STATUS_MESSAGES[currentMessageIndex]}
              </h2>
              <p className="text-sm text-muted-foreground max-w-[280px] sm:max-w-[320px] leading-relaxed">
                Please don&apos;t close this page.<br />
                Large PDFs and images may take up to 1 minute.
              </p>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
