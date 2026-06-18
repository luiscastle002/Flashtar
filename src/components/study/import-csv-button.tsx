"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
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
import { importFromCsv } from "@/actions/imports";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { translateError } from "@/lib/i18n/utils";

interface ImportCsvButtonProps {
  deckId: string;
}

interface ParsedCard {
  front: string;
  back: string;
  tags?: string[];
}

export function ImportCsvButton({ deckId }: ImportCsvButtonProps) {
  const router = useRouter();
  const t = useTranslations("study.csv");
  const tRoot = useTranslations();
  
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedCard[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pending, startTransition] = useTransition();

  function resetState() {
    setFileName("");
    setParsedRows([]);
    setParseError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) resetState();
  }

  function parseCsvContent(text: string) {
    try {
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const rows: ParsedCard[] = [];

      for (const line of lines) {
        const fields: string[] = [];
        let current = "";
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(current);
            current = "";
          } else {
            current += char;
          }
        }
        fields.push(current);

        // Clean up quotes and spacing
        const cleaned = fields.map((f) => {
          let val = f.trim();
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.substring(1, val.length - 1).replace(/""/g, '"');
          }
          return val;
        });

        if (cleaned.length >= 2) {
          const front = cleaned[0];
          const back = cleaned[1];
          const tags = cleaned[2]
            ? cleaned[2]
                .split(";")
                .map((t) => t.trim())
                .filter(Boolean)
            : [];
          rows.push({ front, back, tags });
        }
      }

      if (rows.length === 0) {
        setParseError(t("invalid_rows"));
        return;
      }

      // Check for headers and skip them if present
      let startIndex = 0;
      const firstRow = rows[0];
      const isHeader =
        firstRow.front.toLowerCase() === "front" ||
        firstRow.front.toLowerCase() === "question" ||
        firstRow.back.toLowerCase() === "back" ||
        firstRow.back.toLowerCase() === "answer";

      if (isHeader) {
        startIndex = 1;
      }

      const finalRows = rows.slice(startIndex);
      if (finalRows.length === 0) {
        setParseError(t("header_only"));
        return;
      }

      setParsedRows(finalRows);
      setParseError("");
    } catch (err) {
      console.error(err);
      setParseError(t("parse_error"));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function processFile(file: File) {
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      setParseError(t("unsupported_format"));
      return;
    }
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCsvContent(text);
    };
    reader.onerror = () => {
      setParseError(t("read_failed"));
    };
    reader.readAsText(file);
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
    if (parsedRows.length === 0) return;

    startTransition(async () => {
      const result = await importFromCsv(deckId, parsedRows);
      if ("error" in result && result.error) {
        toast.error(translateError(result.error, tRoot));
        return;
      }

      toast.success(t("toast_success", { count: result.imported ?? 0 }));
      setOpen(false);
      router.refresh();
    });
  }

  const previewRows = parsedRows.slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-1.5" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Dropzone */}
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
              aria-describedby="csv-upload-limits"
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-accent/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="p-3 bg-primary/10 rounded-full text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">{t("upload_drag")}</p>
              <p id="csv-upload-limits" className="text-xs text-muted-foreground">{t("support_format")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected File Details */}
              <div className="flex items-center justify-between border p-3 rounded-lg bg-accent/20">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {tRoot("study.import.cards_count_plural", { count: parsedRows.length })}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={resetState} disabled={pending}>
                  {t("change_file")}
                </Button>
              </div>

              {/* Error State */}
              {parseError && (
                <div className="flex items-start gap-2 text-destructive border border-destructive/20 bg-destructive/5 p-3 rounded-lg text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{parseError}</p>
                </div>
              )}

              {/* Preview Table */}
              {!parseError && parsedRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("preview_title")}
                  </p>
                  <div className="border rounded-md overflow-hidden bg-accent/5">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-accent/20 border-b">
                          <th className="p-2 font-semibold">{t("table_front")}</th>
                          <th className="p-2 font-semibold">{t("table_back")}</th>
                          <th className="p-2 font-semibold">{t("table_tags")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {previewRows.map((row, idx) => (
                          <tr key={idx}>
                            <td className="p-2 truncate max-w-[150px] font-medium">{row.front}</td>
                            <td className="p-2 truncate max-w-[150px]">{row.back}</td>
                            <td className="p-2 text-muted-foreground">
                              {row.tags && row.tags.length > 0 ? (
                                <span className="flex gap-1 flex-wrap">
                                  {row.tags.map((t) => (
                                    <span key={t} className="bg-accent px-1 rounded text-[10px]">
                                      {t}
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                "—"
                              )}
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

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            {tRoot("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={parsedRows.length === 0 || parseError !== "" || pending}
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
      </DialogContent>
    </Dialog>
  );
}
