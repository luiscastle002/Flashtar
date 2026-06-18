"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
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

export function RichTextEditor({ content, onChange, placeholder, className }: RichTextEditorProps) {
  const t = useTranslations("editor");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? t("placeholder") }),
      Image.configure({ inline: true }),
      Underline,
      TextStyle,
      Color,
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

  function addImage() {
    const url = window.prompt(t("enter_image_url"));
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }

  if (!editor) return null;

  const activeColor = editor.getAttributes("textStyle").color;

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

        {/* 6. Image link */}
        <Button 
          type="button" 
          variant="ghost" 
          size="icon" 
          className="h-7 w-7" 
          onClick={addImage}
          title={t("insert_image")}
          aria-label={t("insert_image")}
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </Button>

        {/* 7. Clear Formatting */}
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
      <EditorContent editor={editor} />
    </div>
  );
}
