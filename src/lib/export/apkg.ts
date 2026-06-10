import { Package, Deck, Model, Note } from "ankipack";
import type { SqlJsStatic } from "sql.js";
import type { Flashcard } from "@/types";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function resolveCardType(cardType: Flashcard["card_type"]): "basic" | "cloze" {
  return cardType === "cloze" ? "cloze" : "basic";
}

let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlInitPromise) {
    sqlInitPromise = (async () => {
      const initSqlJs = (await import("sql.js")).default;
      return initSqlJs({
        locateFile: (file) => `/${file}`,
      });
    })();
  }
  return sqlInitPromise;
}

export async function buildApkg(deckName: string, cards: Flashcard[]): Promise<Uint8Array> {
  const SQL = await getSql();

  const deck = new Deck({
    name: deckName,
    config: null,
  });

  // Create models ONCE
  const basicModel = Model.basic();
  const clozeModel = Model.cloze();

  for (const card of cards) {
    const front = stripHtml(card.front);
    const back = stripHtml(card.back);

    const model =
      card.card_type === "cloze"
        ? clozeModel
        : basicModel;

    deck.addNote(
      new Note({
        model,
        fields: [front, back],
      })
    );
  }

  const pkg = new Package();
  pkg.addDeck(deck);

  return pkg.toUint8Array(SQL);
}

export function downloadApkg(filename: string, data: Uint8Array) {
  const blob = new Blob([new Uint8Array(data)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".apkg") ? filename : `${filename}.apkg`;
  link.click();
  URL.revokeObjectURL(url);
}
