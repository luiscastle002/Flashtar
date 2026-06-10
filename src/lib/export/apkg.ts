import { Package, Deck, Model, Note } from "ankipack";
import type { SqlJsStatic } from "sql.js";
import type { Flashcard } from "@/types";
import path from "path";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlInitPromise) {
    sqlInitPromise = (async () => {
      try {
        const sqlModule = await import("sql.js");
      
        console.log("SQL MODULE:", sqlModule);
        console.log("SQL MODULE KEYS:", Object.keys(sqlModule));
      
        const initSqlJs =
          (sqlModule as any).default ??
          sqlModule;
      
        console.log("INIT SQL TYPE:", typeof initSqlJs);
      
        const SQL = await initSqlJs({
          locateFile: (file: string) =>
            path.join(
              process.cwd(),
              "node_modules",
              "sql.js",
              "dist",
              file
            ),
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
