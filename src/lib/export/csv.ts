import type { Flashcard } from "@/types";

export function flashcardsToCsv(deckName: string, cards: Flashcard[]): string {
  const escape = (value: string) => {
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const header = "Front,Back,Type";
  const rows = cards.map(
    (card) => `${escape(stripHtml(card.front))},${escape(stripHtml(card.back))},${card.card_type}`
  );

  return [header, ...rows].join("\n");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
