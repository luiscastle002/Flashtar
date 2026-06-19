"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, Loader2, Lock } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { importFromApkg } from "@/actions/imports";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";
import type { ParsedApkgCard } from "@/lib/import/apkg-reader";
import type { Plan } from "@/types";

interface ImportApkgButtonProps {
  deckId: string;
  plan: Plan;
}

type ParseStage = "idle" | "extracting" | "parsing" | "processing" | "ready" | "error";

export function ImportApkgButton({ deckId, plan }: ImportApkgButtonProps) {
  const router = useRouter();
  const t = useTranslations("study.apkg");
  const tRoot = useTranslations();

  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsedCards, setParsedCards] = useState<ParsedApkgCard[]>([]);
  const [deckName, setDeckName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState("");
  const [parseStage, setParseStage] = useState<ParseStage>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();

  const isPro = plan === "pro";

  function resetState() {
    setFileName("");
    setParsedCards([]);
    setDeckName("");
    setParseError("");
    setParseStage("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) resetState();
  }

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".apkg")) {
      setParseError(t("unsupported_format"));
      return;
    }
    setFileName(file.name);
    setParseError("");
    setParseStage("extracting");

    try {
      // Dynamic import to avoid loading WASM in the initial bundle
      const { parseApkgFile } = await import(
        "@/lib/import/apkg-reader"
      );

      const result = await parseApkgFile(file, (stage) => {
        setParseStage(stage);
      });

      setParsedCards(result.cards);
      setDeckName(result.deckName);
      setParseStage("ready");
    } catch (err) {
      console.error("APKG parse error:", err);
      // Import the error class for instanceof check
      const { ApkgError } = await import("@/lib/import/apkg-reader");
      if (err instanceof ApkgError) {
        switch (err.code) {
          case "INVALID_FORMAT":
            setParseError(t("invalid_apkg"));
            break;
          case "TOO_LARGE":
            setParseError(tRoot("errors.imports.apkg_too_large"));
            break;
          case "NO_DATABASE":
            setParseError(tRoot("errors.imports.apkg_no_database"));
            break;
          case "NO_NOTES":
            setParseError(t("no_notes"));
            break;
          default:
            setParseError(tRoot("errors.imports.apkg_parse_failed"));
        }
      } else {
        setParseError(tRoot("errors.imports.apkg_parse_failed"));
      }
      setParseStage("error");
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function handleImport() {
    if (parsedCards.length === 0) return;

    const cardsToImport = parsedCards.map((c) => ({
      front: c.front,
      back: c.back,
    }));

    startTransition(async () => {
      const result = await importFromApkg(deckId, cardsToImport, fileName);
      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        return;
      }

      toast.success(t("toast_success", { count: result.imported ?? 0 }));
      setOpen(false);
      router.refresh();
    });
  }

  const previewCards = parsedCards.slice(0, 5);
  const isLoading =
    parseStage === "extracting" ||
    parseStage === "parsing" ||
    parseStage === "processing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Upload className="h-4 w-4 mr-1.5" />
          {t("button")}
          {!isPro && (
            <Badge
              variant="secondary"
              className="ml-1.5 px-1.5 py-0 text-[10px] font-semibold bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-700 dark:text-amber-300 border-amber-300/50"
            >
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              {t("pro_badge")}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {!isPro ? (
          /* Pro-only gate */
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="p-4 rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200/50 dark:border-amber-800/50">
              <Lock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-1.5">
              <p className="font-semibold">
                {tRoot("errors.imports.apkg_pro_required")}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {t("description")}
              </p>
            </div>
            <Button asChild className="mt-2">
              <a href="/settings">{t("upgrade_pro")}</a>
            </Button>
          </div>
        ) : (
          /* Pro user — full import flow */
          <div className="space-y-4 my-2">
            {/* Dropzone or File Preview */}
            {!fileName ? (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-describedby="apkg-upload-limits"
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none ${
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-accent/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".apkg"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="p-3 bg-primary/10 rounded-full text-primary">
                  <Upload className="h-6 w-6" />
                </div>
                <p className="text-sm font-medium">{t("upload_drag")}</p>
                <p
                  id="apkg-upload-limits"
                  className="text-xs text-muted-foreground"
                >
                  {t("support_format")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Selected File Details */}
                <div className="flex items-center justify-between border p-3 rounded-lg bg-accent/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {fileName}
                      </p>
                      {parseStage === "ready" && (
                        <p className="text-xs text-muted-foreground">
                          {t("cards_found", { count: parsedCards.length })}
                          {deckName && (
                            <span className="ml-1 text-muted-foreground/70">
                              — {deckName}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetState}
                    disabled={pending || isLoading}
                  >
                    {t("change_file")}
                  </Button>
                </div>

                {/* Loading State */}
                {isLoading && (
                  <div className="flex items-center gap-3 justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {parseStage === "extracting" && t("extracting")}
                      {parseStage === "parsing" && t("parsing")}
                      {parseStage === "processing" && t("extracting")}
                    </p>
                  </div>
                )}

                {/* Error State */}
                {parseError && (
                  <div className="flex items-start gap-2 text-destructive border border-destructive/20 bg-destructive/5 p-3 rounded-lg text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{parseError}</p>
                  </div>
                )}

                {/* Preview Table */}
                {parseStage === "ready" &&
                  !parseError &&
                  parsedCards.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("preview_title")}
                      </p>
                      <div className="border rounded-md overflow-hidden bg-accent/5">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-accent/20 border-b">
                              <th className="p-2 font-semibold">
                                {t("table_front")}
                              </th>
                              <th className="p-2 font-semibold">
                                {t("table_back")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {previewCards.map((card, idx) => (
                              <tr key={idx}>
                                <td className="p-2 truncate max-w-[200px] font-medium">
                                  {card.front}
                                </td>
                                <td className="p-2 truncate max-w-[200px]">
                                  {card.back || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Footer — only show for Pro users with parsed cards */}
        {isPro && (
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              {tRoot("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={
                parsedCards.length === 0 ||
                parseError !== "" ||
                pending ||
                isLoading
              }
              onClick={handleImport}
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  {tRoot("common.creating")}
                </>
              ) : (
                t("confirm_button")
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
