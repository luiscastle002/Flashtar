import type { Flashcard } from "@/types";

/**
 * Generates an Anki APKG file on the client side using ankipack and sql.js WASM loaded from CDN.
 * 
 * @param deckName - Name of the deck
 * @param cards - List of flashcards to include
 * @returns A promise that resolves to the APKG file contents as a Uint8Array
 */
export async function buildApkgClient(deckName: string, cards: Flashcard[]): Promise<Uint8Array> {
  // Load sql.js and ankipack dynamically so they are not loaded during Next.js server-side rendering (SSR)
  const initSqlJs = (await import("sql.js")).default;
  const { Package, Deck, Model, Note } = await import("ankipack");

  // Initialize sql.js by loading the WASM binary from the jsDelivr CDN
  const SQL = await initSqlJs({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${file}`,
  });

  // Set up the standard models supported by Anki
  const basicModel = Model.basic();
  const clozeModel = Model.cloze();

  // Initialize the deck
  const deck = new Deck({
    name: deckName,
  });

  // Process cards and add them to the deck
  for (const card of cards) {
    const isCloze = card.card_type === "cloze";
    const model = isCloze ? clozeModel : basicModel;

    deck.addNote(
      new Note({
        model,
        // For basic: fields[0] is Front, fields[1] is Back
        // For cloze: fields[0] is Text, fields[1] is Extra
        fields: [card.front, card.back],
      })
    );
  }

  // Add the deck to a new package
  const pkg = new Package();
  pkg.addDeck(deck);

  // Compile the package to an in-memory ZIP archive bytes
  const bytes = await pkg.toUint8Array(SQL);
  return bytes;
}
