import { Package, Deck, Model, Note } from "ankipack";
import type { SqlJsStatic } from "sql.js";
import type { Flashcard } from "@/types";


function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlInitPromise) {
    sqlInitPromise = (async () => {
      try {
        // IMPORTANT: simple dynamic import (no eval, no tricks)
        const sqlModule = await import("sql.js");

        const initSqlJs =
          sqlModule.default ?? sqlModule;

        if (typeof initSqlJs !== "function") {
          throw new Error("sql.js initializer is not a function");
        }

        const SQL = await initSqlJs({
          locateFile: (file: string) =>
            `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
        });

        return SQL;
      } catch (err) {
        console.error("FULL SQL ERROR:", err);
        throw err;
      }
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

  const basicModel = Model.basic();
  const clozeModel = Model.cloze();

  for (const card of cards) {
    const front = stripHtml(card.front);
    const back = stripHtml(card.back);

    const model = card.card_type === "cloze" ? clozeModel : basicModel;

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
