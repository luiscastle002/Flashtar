"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  Bold,
  Italic,
  List,
  ImageIcon,
  Underline as UnderlineIcon,
  Palette,
  Eraser,
  Volume2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AudioExtension } from "./audio-extension";
import { MediaExtension } from "./media-extension";
import { MediaContext } from "./media-context";
import type { CardAudio } from "@/types";
import { AudioContext } from "./audio-context";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  audios?: CardAudio[];
  onAudioClick?: (editor: Editor) => void;
  onMoveSide?: (audioId: string, deleteNode: () => void) => void;
  onDelete?: (audioId: string) => void;
  editorRef?: React.MutableRefObject<Editor | null>;
}

const PREDEFINED_COLORS = [
  { name: "black" as const, value: "#000000" },
  { name: "red" as const, value: "#ef4444" },
  { name: "blue" as const, value: "#3b82f6" },
  { name: "green" as const, value: "#22c55e" },
  { name: "yellow" as const, value: "#eab308" },
  { name: "purple" as const, value: "#a855f7" },
] as const;

type ColorKey = "colors.black" | "colors.red" | "colors.blue" | "colors.green" | "colors.yellow" | "colors.purple";

export function RichTextEditor({
  content,
  onChange,
  placeholder,
  className,
  audios,
  onAudioClick,
  onMoveSide,
  onDelete,
  editorRef
}: RichTextEditorProps) {
  const t = useTranslations("editor");

  const [insertOpen, setInsertOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [overrideType, setOverrideType] = useState<"auto" | "image" | "audio" | "video" | "embed">("auto");
  const [isProbing, setIsProbing] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? t("placeholder") }),
      MediaExtension,
      Underline,
      TextStyle,
      Color,
      AudioExtension,
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none min-h-[80px] px-3 py-2 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  if (!editor) return null;

  const activeColor = editor.getAttributes("textStyle").color;

  const detectMediaType = (url: string): "image" | "audio" | "video" | "embed" | "link" => {
    const cleanUrl = url.trim().toLowerCase();
    
    // YouTube / Vimeo embeds check
    if (
      cleanUrl.includes("youtube.com") ||
      cleanUrl.includes("youtu.be") ||
      cleanUrl.includes("vimeo.com")
    ) {
      return "embed";
    }

    // Common file extension checks
    if (cleanUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)$/i)) return "image";
    if (cleanUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) return "audio";
    if (cleanUrl.match(/\.(mp4|webm|ogv|mov|m4v)$/i)) return "video";

    return "link";
  };

  const insertMedia = (url: string, type: "image" | "audio" | "video" | "embed" | "link") => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .insertContentAt(editor.state.doc.content.size, {
        type: "media",
        attrs: {
          src: url,
          mediaType: type,
          alignment: "center",
          width: "100%",
          fit: "contain",
        },
      })
      .run();
  };

  const handleInsertMedia = async () => {
    if (!mediaUrl.trim()) return;
    const url = mediaUrl.trim();

    if (overrideType !== "auto") {
      insertMedia(url, overrideType);
      setInsertOpen(false);
      return;
    }

    // Attempt client-side regex check first to speed up typical entries
    const clientDetected = detectMediaType(url);
    if (clientDetected !== "link") {
      insertMedia(url, clientDetected);
      setInsertOpen(false);
      return;
    }

    // Fall back to server probing to resolve redirects/dynamic URLs
    setIsProbing(true);
    try {
      const response = await fetch(`/api/media/probe?url=${encodeURIComponent(url)}`);
      if (response.ok) {
        const data = await response.json();
        insertMedia(url, data.detectedType || "link");
      } else {
        insertMedia(url, "link");
      }
    } catch (err) {
      console.error("[Media Probe client error]:", err);
      insertMedia(url, "link");
    } finally {
      setIsProbing(false);
      setInsertOpen(false);
    }
  };

  return (
    <div className={cn("rounded-md border bg-background", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1">
        {/* 1. Bold */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", editor.isActive("bold") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-active={editor.isActive("bold")}
          title={t("bold")}
          aria-label={t("bold")}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>

        {/* 2. Italic */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", editor.isActive("italic") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-active={editor.isActive("italic")}
          title={t("italic")}
          aria-label={t("italic")}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>

        {/* 3. Underline */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", editor.isActive("underline") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-active={editor.isActive("underline")}
          title={t("underline")}
          aria-label={t("underline")}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>

        {/* 4. Text Color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", editor.isActive("textStyle") && "bg-muted")}
              data-active={editor.isActive("textStyle")}
              title={t("text_color")}
              aria-label={t("text_color")}
            >
              <Palette 
                className="h-3.5 w-3.5 transition-colors" 
                style={activeColor ? { color: activeColor } : undefined}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="p-2 min-w-[130px]">
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-1.5">
                {PREDEFINED_COLORS.map((color) => {
                  const isActive = editor.isActive("textStyle", { color: color.value });
                  const colorKey = `colors.${color.name}` as ColorKey;
                  const localizedName = t(colorKey);
                  return (
                    <button
                      key={color.name}
                      type="button"
                      className={cn(
                        "h-6 w-6 rounded-md border border-border cursor-pointer flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-1 focus:ring-ring",
                        isActive && "ring-2 ring-primary ring-offset-1"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={localizedName}
                      aria-label={localizedName}
                      onClick={() => {
                        editor.chain().focus().setColor(color.value).run();
                      }}
                    />
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[10px] justify-center px-1 font-medium"
                onClick={() => editor.chain().focus().unsetColor().run()}
              >
                {t("reset_default")}
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 5. List */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", editor.isActive("bulletList") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-active={editor.isActive("bulletList")}
          title={t("bullet_list")}
          aria-label={t("bullet_list")}
        >
          <List className="h-3.5 w-3.5" />
        </Button>

        {/* 6. Universal Media Link */}
        <Button 
          type="button" 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7" 
          onClick={() => {
            setMediaUrl("");
            setOverrideType("auto");
            setInsertOpen(true);
          }}
          title="Insert Universal Media URL"
          aria-label="Insert Universal Media URL"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>

        {/* 7. Audio link */}
        {onAudioClick && (
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7" 
            onClick={() => onAudioClick(editor)}
            title={t("insert_audio")}
            aria-label={t("insert_audio")}
          >
            <Volume2 className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* 8. Clear Formatting */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:text-destructive transition-colors"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title={t("clear_formatting")}
          aria-label={t("clear_formatting")}
        >
          <Eraser className="h-3.5 w-3.5" />
        </Button>
      </div>

      <MediaContext.Provider value={{}}>
        <AudioContext.Provider value={{ audios: audios ?? [], onMoveSide, onDelete }}>
          <EditorContent editor={editor} />
        </AudioContext.Provider>
      </MediaContext.Provider>

      {/* Insert Universal Media Dialog */}
      <Dialog open={insertOpen} onOpenChange={setInsertOpen}>
        <DialogContent className="max-w-md w-full" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Insert Media URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="media-url">Paste Media URL</Label>
              <Input
                id="media-url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder="https://example.com/media.mp3, image.png, youtube.com/..."
                disabled={isProbing}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Override Media Type (Optional)</Label>
              <div className="grid grid-cols-5 gap-1">
                {(["auto", "image", "audio", "video", "embed"] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    variant={overrideType === type ? "default" : "outline"}
                    className="text-[10px] h-7 px-1 capitalize"
                    onClick={() => setOverrideType(type)}
                    disabled={isProbing}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInsertOpen(false)} disabled={isProbing}>
              Cancel
            </Button>
            <Button onClick={handleInsertMedia} disabled={isProbing || !mediaUrl.trim()}>
              {isProbing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Insert Media
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
