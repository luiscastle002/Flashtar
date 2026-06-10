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
        console.log("Initializing sql.js...");

        const initSqlJs = (await import("sql.js")).default;
        const path = await import("path");

        const SQL = await initSqlJs({
          locateFile: (file) => {
            const wasmPath = path.join(
              process.cwd(),
              "node_modules",
              "sql.js",
              "dist",
              file
            );

            console.log("WASM PATH:", wasmPath);

            return wasmPath;
          },
        });

        console.log("sql.js initialized successfully");

        return SQL;
      } catch (err) {
        console.error("SQL INIT ERROR:", err);
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
