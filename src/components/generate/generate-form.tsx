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
  SlidersHorizontal,
  Trash2,
  Star,
  Pin,
  ChevronDown,
  ChevronRight,
  Volume2
} from "lucide-react";

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
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import type { Plan, Profile, SavedPrompt } from "@/types";
import { PLAN_LIMITS } from "@/types";
import { cn } from "@/lib/utils";
import {
  createSavedPrompt,
  updateSavedPrompt,
  deleteSavedPrompt,
} from "@/actions/prompts";
import { SYSTEM_PROMPTS } from "@/lib/constants/system-prompts";


interface GeneratePageProps {
  plan: Plan;
  monthlyGenerations: number;
  profile: Profile | null;
  initialPrompts: SavedPrompt[];
  googleConnected: boolean;
}

type GenerateMode = "prompt" | "import" | "url";

type GenerationState =
  | "idle"
  | "uploading"
  | "processing"
  | "redirecting"
  | "error";

const STATUS_KEYS = [
  "reading",
  "extracting",
  "generating",
  "organizing",
] as const;

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
          reject(new Error("errors.generate.parse_failed"));
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          reject(new Error(response.error ?? "errors.generate.failed"));
        } catch {
          reject(new Error("errors.generate.failed"));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("errors.generate.network_error"));
    };

    xhr.send(formData);
  });
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "xlsx", "txt", "png", "jpg", "jpeg", "webp"];
const ACCEPT_ATTRIBUTE = ".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webp";

function formatFileSize(bytes: number, tCommon: (key: string) => string) {
  if (bytes === 0) return `0 ${tCommon("file_size.bytes")}`;
  const k = 1024;
  const sizes = [
    tCommon("file_size.bytes"),
    tCommon("file_size.kb"),
    tCommon("file_size.mb"),
    tCommon("file_size.gb")
  ];
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

export function GenerateForm({ plan, monthlyGenerations, profile, initialPrompts, googleConnected }: GeneratePageProps) {
  const router = useRouter();
  const t = useTranslations("generate");
  const tCommon = useTranslations("common");
  const tRoot = useTranslations();
  const langKeyMap: Record<string, string> = {
    English: "language.english",
    Spanish: "language.spanish",
    Portuguese: "language.portuguese",
    Japanese: "language.japanese",
    French: "language.french",
    German: "language.german",
    Chinese: "language.chinese",
  };
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
      setCurrentMessageIndex((prev) => (prev + 1) % STATUS_KEYS.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [generationState]);

  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("English");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [cardCount, setCardCount] = useState(20);
  const [cardType, setCardType] = useState("basic");

  // Audio generation settings
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVoice, setAudioVoice] = useState("alloy");
  const [audioPlacement, setAudioPlacement] = useState<"front" | "back" | "both">("back");
  const [audioProvider, setAudioProvider] = useState("openai");

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

  const [systemTemplatesCollapsed, setSystemTemplatesCollapsed] = useState(false);

  useEffect(() => {
    const collapsed = localStorage.getItem("flashtar_system_prompts_collapsed") === "true";
    setSystemTemplatesCollapsed(collapsed);
  }, []);

  const toggleSystemTemplates = () => {
    const nextState = !systemTemplatesCollapsed;
    setSystemTemplatesCollapsed(nextState);
    localStorage.setItem("flashtar_system_prompts_collapsed", String(nextState));
  };


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
        if (!confirm(t("confirm_discard_changes"))) {
          return;
        }
      }
    }
    setConfigOpen(open);
  };

  const handleApplyConfig = () => {
    if (tempInstructions.length > 2000) {
      toast.error(t("toast_instructions_limit"));
      return;
    }
    setCustomInstructions(tempInstructions);
    setConfigOpen(false);
    toast.success(t("toast_config_applied"));
  };

  // CRUD actions using server actions with optimistic updates
  const handleDeletePrompt = async (id: string) => {
    startTransition(async () => {
      setOptimisticPrompts({ type: "delete", payload: id });
      const res = await deleteSavedPrompt(id);
      if (res && "error" in res) {
        toast.error(translateError(res.error, tRoot));
      } else {
        setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
        toast.success(t("toast_prompt_deleted"));
      }
    });
  };

  const handleToggleFavorite = async (promptItem: SavedPrompt) => {
    const newFav = !promptItem.is_favorite;
    startTransition(async () => {
      setOptimisticPrompts({ type: "update", payload: { id: promptItem.id, updates: { is_favorite: newFav } } });
      const res = await updateSavedPrompt(promptItem.id, { is_favorite: newFav });
      if (res && "error" in res) {
        toast.error(translateError(res.error, tRoot));
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
        toast.error(translateError(res.error, tRoot));
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
      toast.error(t("toast_prompt_empty"));
      return;
    }
    if (!tempInstructions.trim()) {
      toast.error(t("toast_instructions_empty"));
      return;
    }
    if (tempInstructions.length > 5000) {
      toast.error(t("toast_instructions_save_limit"));
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
        toast.error(translateError(res.error, tRoot));
      } else if (res.data) {
        setSavedPrompts((prev) => [res.data, ...prev]);
        setNewPromptName("");
        toast.success(t("toast_prompt_saved"));
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
      toast.error(t("toast_prompt_short"));
      return;
    }

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(t("toast_plan_limit", { max: maxCards }));
      return;
    }

    if (remaining <= 0) {
      toast.error(t("toast_limit_reached"));
      return;
    }

    setGenerationState("processing");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt, 
          language, 
          difficulty, 
          cardCount, 
          cardType, 
          customInstructions,
          audioEnabled,
          audioVoice,
          audioPlacement,
          audioProvider
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGenerationState("redirecting");
      toast.success(t("toast_generated_count", { count: data.cardCount }));
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      toast.error(error instanceof Error ? translateError(error.message, tRoot) : tRoot("errors.generate.failed"));
    }
  }

  async function handleImportGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (uploadedFiles.length === 0) {
      toast.error(t("toast_upload_empty"));
      return;
    }

    if (uploadedFiles.length > 5) {
      toast.error(t("toast_max_files"));
      return;
    }

    const totalSize = uploadedFiles.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 4 * 1024 * 1024) {
      toast.error(t("toast_max_size"));
      return;
    }

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(t("toast_plan_limit", { max: maxCards }));
      return;
    }

    if (remaining <= 0) {
      toast.error(t("toast_limit_reached"));
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
      formData.append("audioEnabled", audioEnabled.toString());
      formData.append("audioVoice", audioVoice);
      formData.append("audioPlacement", audioPlacement);
      formData.append("audioProvider", audioProvider);

      const data = await uploadWithProgress("/api/generate", formData, (percent) => {
        setProgress(percent);
        if (percent >= 100) {
          setGenerationState("processing");
        }
      });

      setGenerationState("redirecting");
      toast.success(t("toast_generated_count", { count: data.cardCount }));
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      setProgress(0);
      toast.error(error instanceof Error ? translateError(error.message, tRoot) : tRoot("errors.generate.failed"));
    }
  }

  async function handleUrlGenerate(e: React.FormEvent) {
    e.preventDefault();

    if (!url) {
      toast.error(t("toast_invalid_url"));
      return;
    }

    const maxCards = Math.min(limits.maxCardsPerDeck, 50);
    if (cardCount > maxCards) {
      toast.error(t("toast_plan_limit", { max: maxCards }));
      return;
    }

    if (remaining <= 0) {
      toast.error(t("toast_limit_reached"));
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
      formData.append("audioEnabled", audioEnabled.toString());
      formData.append("audioVoice", audioVoice);
      formData.append("audioPlacement", audioPlacement);
      formData.append("audioProvider", audioProvider);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGenerationState("redirecting");
      toast.success(t("toast_generated_count", { count: data.cardCount }));
      router.push(`/decks/${data.deck.id}`);
    } catch (error) {
      setGenerationState("idle");
      toast.error(error instanceof Error ? translateError(error.message, tRoot) : tRoot("errors.generate.failed"));
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
      toast.error(t("toast_use_url"));
      return;
    }

    if (hasUrl && hasFiles) {
      toast.error(t("toast_use_url"));
    }

    if (hasFiles) {
      const validFiles = files.filter((file) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === "xlsx" && file.size > 1 * 1024 * 1024) {
          toast.error(t("toast_excel_limit", { name: file.name }));
          return false;
        }
        return ext && ALLOWED_EXTENSIONS.includes(ext);
      });

      if (validFiles.length < files.length) {
        toast.error(t("toast_file_unsupported"));
      }

      if (validFiles.length > 0) {
        if (uploadedFiles.length + validFiles.length > 5) {
          toast.error(t("toast_max_files"));
          return;
        }

        const totalSize = [...uploadedFiles, ...validFiles].reduce((sum, f) => sum + f.size, 0);
        if (totalSize > 4 * 1024 * 1024) {
          toast.error(t("toast_max_size"));
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
        if (ext === "xlsx" && file.size > 1 * 1024 * 1024) {
          toast.error(t("toast_excel_limit", { name: file.name }));
          return false;
        }
        return ext && ALLOWED_EXTENSIONS.includes(ext);
      });

      if (validFiles.length < files.length) {
        toast.error(t("toast_file_unsupported"));
      }

      if (validFiles.length > 0) {
        if (uploadedFiles.length + validFiles.length > 5) {
          toast.error(t("toast_max_files"));
          return;
        }

        const totalSize = [...uploadedFiles, ...validFiles].reduce((sum, f) => sum + f.size, 0);
        if (totalSize > 4 * 1024 * 1024) {
          toast.error(t("toast_max_size"));
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
        <Label>{t("card_type")}</Label>
        <Select value={cardType} onValueChange={setCardType} disabled={loading}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="basic">{t("basic_type")}</SelectItem>
            <SelectItem value="cloze">{t("cloze_type")}</SelectItem>
            <SelectItem value="mixed">{t("mixed_type")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cardCount">{t("number_of_cards")}</Label>
        <Input
          id="cardCount"
          type="number"
          min={1}
          max={limits.maxCardsPerDeck}
          value={cardCount}
          onChange={(e) => setCardCount(Number(e.target.value))}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">{t("max_cards_plan", { max: limits.maxCardsPerDeck })}</p>
      </div>
    </div>
  );

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            {t("title")}
          </h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {remaining !== Infinity && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between text-sm mb-2">
                <span>{t("monthly_remaining")}</span>
                <span className="font-medium">{t("remaining_count", { remaining, total: limits.monthlyGenerations })}</span>
              </div>
              <Progress
                value={(monthlyGenerations / limits.monthlyGenerations) * 100}
                className="h-2"
              />
            </CardContent>
          </Card>
        )}

        {/* Tab Selector */}
        <div className="flex p-1 bg-card/70 backdrop-blur-md rounded-xl border border-border/50 w-full shadow-md">
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
            {t("prompt_tab")}
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
            {t("files_tab")}
          </button>
        </div>

        <div className="transition-all duration-300">
          {mode === "prompt" ? (
            <Card className="transition-all duration-300">
              <CardHeader>
                <CardTitle>{t("configuration")}</CardTitle>
                <CardDescription>{t("config_desc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleGenerate} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="prompt">{t("prompt_label")}</Label>
                    <Textarea
                      id="prompt"
                      placeholder={t("prompt_placeholder")}
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
                      {t("configuration")}
                      {customInstructions.trim() && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Button>
                  </div>

                  <Button type="submit" className="w-full h-12 text-base" size="lg" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("generating")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("generate_deck")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : mode === "import" ? (
            <Card className="transition-all duration-300">
              <CardHeader>
                <CardTitle>{t("import_files_title")}</CardTitle>
                <CardDescription>
                  {t("import_files_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleImportGenerate} className="space-y-6">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    tabIndex={0}
                    role="button"
                    aria-describedby="file-upload-formats"
                    className={cn(
                      "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 text-center transition-all duration-300 cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none",
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
                        {t.rich("drag_drop_files", {
                          browse: (chunks) => <span className="text-primary hover:underline">{chunks}</span>
                        })}
                      </p>
                      <p id="file-upload-formats" className="text-xs text-muted-foreground mt-1">
                        {t("supported_formats")}
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
                                  {formatFileSize(file.size, tCommon)}
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
                      {t("configuration")}
                      {customInstructions.trim() && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-primary" />
                      )}
                    </Button>
                  </div>

                  {generationState === "uploading" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("uploading_files", { percent: progress })}
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
                        {t("generating")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("generate_from_files")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <Card className="transition-all duration-300">
              <CardHeader>
                <CardTitle>{t("import_url_title")}</CardTitle>
                <CardDescription>
                  {t("import_url_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUrlGenerate} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="url-input">{t("url_label")}</Label>
                    <Input
                      id="url-input"
                      type="url"
                      placeholder={t("url_placeholder")}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("url_supported_hint")}
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
                      {t("configuration")}
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
                        {t("generating")}
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t("generate_from_url")}
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
            <DialogTitle>{t("config_title")}</DialogTitle>
            <DialogDescription>
              {t("config_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* AI Custom Instructions */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="custom-instructions">{t("ai_instructions")}</Label>
                <span className={cn(
                  "text-xs text-muted-foreground",
                  tempInstructions.length > 2000 && "text-destructive font-medium"
                )}>
                  {tempInstructions.length}/2000
                </span>
              </div>
              <Textarea
                id="custom-instructions"
                placeholder={t("ai_instructions_placeholder")}
                value={tempInstructions}
                onChange={(e) => setTempInstructions(e.target.value)}
                rows={5}
                className="whitespace-pre-wrap resize-none"
              />
            </div>

            {/* Language & Difficulty Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("language")}</Label>
                <Select value={language} onValueChange={handleLanguageChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["English", "Spanish", "French", "German", "Portuguese", "Japanese", "Chinese"].map(
                      (lang) => (
                        <SelectItem key={lang} value={lang}>
                          {langKeyMap[lang] ? tRoot(langKeyMap[lang] as Parameters<typeof tRoot>[0]) : lang}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t("difficulty")}</Label>
                <Select value={difficulty} onValueChange={handleDifficultyChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">{t("difficulty_beginner")}</SelectItem>
                    <SelectItem value="intermediate">{t("difficulty_intermediate")}</SelectItem>
                    <SelectItem value="advanced">{t("difficulty_advanced")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Text-to-Speech (TTS) Settings */}
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 text-left">
                  <Label className="text-base flex items-center gap-1.5">
                    <Volume2 className="h-4.5 w-4.5 text-indigo-500" />
                    {t("audio.title")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("audio.toggle_desc")}
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="audio-enabled"
                  checked={audioEnabled}
                  disabled={!googleConnected}
                  onChange={(e) => setAudioEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                />
              </div>

              {!googleConnected && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-500 text-left">
                  {t("audio.not_connected_warning")}
                </div>
              )}

              {audioEnabled && googleConnected && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in-50 duration-200">
                  <div className="space-y-2 text-left">
                    <Label>{t("audio.provider_label")}</Label>
                    <Select value={audioProvider} onValueChange={(val) => {
                      setAudioProvider(val);
                      setAudioVoice(val === "openai" ? "alloy" : "en-US-Neural2-F");
                    }}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI TTS</SelectItem>
                        <SelectItem value="google-cloud">Google Cloud TTS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 text-left">
                    <Label>{t("audio.voice_label")}</Label>
                    <Select value={audioVoice} onValueChange={setAudioVoice}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {audioProvider === "openai" ? (
                          <>
                            <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                            <SelectItem value="echo">Echo (Male)</SelectItem>
                            <SelectItem value="fable">Fable (Narrator)</SelectItem>
                            <SelectItem value="onyx">Onyx (Deep Male)</SelectItem>
                            <SelectItem value="nova">Nova (Energetic Female)</SelectItem>
                            <SelectItem value="shimmer">Shimmer (Professional)</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="en-US-Neural2-F">English (Female - Neural2)</SelectItem>
                            <SelectItem value="en-US-Neural2-H">English (Male - Neural2)</SelectItem>
                            <SelectItem value="es-ES-Neural2-F">Spanish (Female - Neural2)</SelectItem>
                            <SelectItem value="pt-BR-Neural2-A">Portuguese (Female - Neural2)</SelectItem>
                            <SelectItem value="ja-JP-Neural2-F">Japanese (Female - Neural2)</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2 text-left">
                    <Label>{t("audio.placement_label")}</Label>
                    <Select value={audioPlacement} onValueChange={(val: string) => setAudioPlacement(val as "front" | "back" | "both")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="front">{t("audio.placement_front")}</SelectItem>
                        <SelectItem value="back">{t("audio.placement_back")}</SelectItem>
                        <SelectItem value="both">{t("audio.placement_both")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* System Templates (Onboarding Examples) */}
            <div className="border-t pt-4 space-y-3">
              <div 
                className="flex items-center justify-between cursor-pointer select-none"
                onClick={toggleSystemTemplates}
              >
                <h3 className="text-sm font-semibold tracking-tight flex items-center gap-1.5 hover:text-primary transition-colors">
                  {systemTemplatesCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                  {t("system_templates")}
                </h3>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">
                  {t("example_count_plural", { count: SYSTEM_PROMPTS.length })}
                </span>
              </div>

              {!systemTemplatesCollapsed && (
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 animate-in fade-in-50 duration-200">
                  {SYSTEM_PROMPTS.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 rounded-lg border border-border/60 text-sm bg-muted/20 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs truncate max-w-[200px]">{p.name}</span>
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{t("builtin")}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate max-w-[350px]">
                          {p.content}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs font-semibold hover:bg-background/80"
                          onClick={() => {
                            setTempInstructions(p.content);
                            toast.success(t("toast_loaded_system", { name: p.name }));
                          }}
                        >
                          {t("load")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Prompt Manager */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold tracking-tight">{t("your_templates")}</h3>

              {/* Inline Save Prompt Action */}
              <div className="flex gap-2">
                <Input
                  placeholder={t("save_current_placeholder")}
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
                  {t("save_current")}
                </Button>
              </div>

              {/* Saved Prompts list */}
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {optimisticPrompts.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    {t("no_templates")}
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
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{t("default")}</span>
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
                            toast.success(t("toast_loaded_prompt", { name: p.name }));
                          }}
                        >
                          {t("load")}
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
                          title={p.is_default ? t("primary_default") : t("set_default")}
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
                            if (confirm(t("confirm_delete_prompt", { name: p.name }))) {
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
              {tCommon("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleApplyConfig}
              disabled={tempInstructions.length > 2000}
            >
              {t("apply_settings")}
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
                  ? t("status.opening_deck") 
                  : t(`status.${STATUS_KEYS[currentMessageIndex]}`)}
              </h2>
              <p className="text-sm text-muted-foreground max-w-[280px] sm:max-w-[320px] leading-relaxed whitespace-pre-line">
                {t("please_wait_hint")}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
