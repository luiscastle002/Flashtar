"use client";

import type { Plan } from "@/types";

/**
 * Client-side APKG file parser.
 *
 * Flow: File → fflate.unzip → sql.js (WASM from CDN) → extract notes → front/back cards
 *
 * Reuses the same sql.js CDN pattern as the APKG export module (apkg-client.ts).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedApkgCard {
  front: string;
  back: string;
  isCloze: boolean;
}

export interface ParsedApkgResult {
  cards: ParsedApkgCard[];
  deckName: string;
  totalNotes: number;
  limitReached?: boolean;
  mediaFiles?: Record<string, Uint8Array>;
}

// Anki model definition (partial — only the fields we need)
interface AnkiModel {
  name: string;
  type: number; // 0 = basic/standard, 1 = cloze
  flds: Array<{ name: string; ord: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIELD_SEPARATOR = "\x1f"; // Anki uses Unit Separator (0x1F) between fields
const CLOZE_REGEX = /\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g;
const MAX_EXTRACTED_DB_SIZE = 100_000_000; // 100 MB extracted limit (zip bomb guard)
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB file size limit

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

function isValidSqlite(data: Uint8Array): boolean {
  if (data.length < 16) return false;
  const expected = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];
  for (let i = 0; i < 16; i++) {
    if (data[i] !== expected[i]) return false;
  }
  return true;
}

function verifyNotesTableExists(db: import("sql.js").Database): boolean {
  try {
    const result = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notes'"
    );
    return result.length > 0 && result[0].values.length > 0;
  } catch {
    return false;
  }
}

/**
 * Parses an APKG file in the browser and returns extracted front/back cards.
 *
 * @param file - The .apkg File object from the file input
 * @param plan - The user's subscription plan ('free' | 'pro')
 * @param onProgress - Optional progress callback for UI updates
 * @returns Parsed cards with deck name and note count
 */
export async function parseApkgFile(
  file: File,
  plan: Plan,
  onProgress?: (stage: "extracting" | "parsing" | "processing") => void
): Promise<ParsedApkgResult> {
  // 1. Validate file basics
  if (!file.name.toLowerCase().endsWith(".apkg")) {
    throw new ApkgError("INVALID_FORMAT", "Only .apkg files are supported.");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new ApkgError("TOO_LARGE", "APKG file exceeds maximum size.");
  }

  // 2. Read file into Uint8Array
  const fileBuffer = new Uint8Array(await file.arrayBuffer());

  // 3. Unzip the APKG (it's a ZIP archive)
  onProgress?.("extracting");
  const { unzipSync } = await import("fflate");

  let unzipped: Record<string, Uint8Array>;
  try {
    // Memory optimization: only extract the SQL databases
    unzipped = unzipSync(fileBuffer, {
      filter: (f) =>
        f.name === "collection.anki2" ||
        f.name === "collection.anki21" ||
        f.name === "collection.anki21b" ||
        f.name === "media" ||
        /^\d+$/.test(f.name),
    });
  } catch {
    throw new ApkgError("INVALID_FORMAT", "This file is not a valid Anki package.");
  }

  // 4. Resolve file precedence: collection.anki21 -> collection.anki21b -> collection.anki2
  let dbFile = unzipped["collection.anki21"] ?? null;
  let isCompressed = false;

  if (!dbFile) {
    if (unzipped["collection.anki21b"]) {
      dbFile = unzipped["collection.anki21b"];
      isCompressed = true;
    } else if (unzipped["collection.anki2"]) {
      dbFile = unzipped["collection.anki2"];
    }
  }

  if (!dbFile) {
    throw new ApkgError("NO_DATABASE", "No Anki database found in file.");
  }

  // Decompress if compressed (zstd)
  if (isCompressed) {
    try {
      const fzstd = await import("fzstd");
      dbFile = fzstd.decompress(dbFile);
    } catch (err) {
      console.error("Zstd decompression failed:", err);
      throw new ApkgError("PARSE_FAILED", "Failed to decompress the database file.");
    }
  }

  // Verify SQLite file signature
  if (!isValidSqlite(dbFile)) {
    throw new ApkgError("INVALID_APKG_DATABASE", "The database file is not a valid SQLite database.");
  }

  // Zip bomb guard
  if (dbFile.byteLength > MAX_EXTRACTED_DB_SIZE) {
    throw new ApkgError("TOO_LARGE", "APKG file exceeds maximum size.");
  }

  // 5. Open the SQLite database with sql.js
  onProgress?.("parsing");
  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/sql.js@1.14.1/dist/${f}`,
  });
  const db = new SQL.Database(dbFile);

  try {
    // 6. Extract models (note types) from the collection
    const models = extractModels(db);

    // 7. Extract notes and convert to cards
    onProgress?.("processing");
    const { cards, deckName, totalNotes, limitReached } = extractCards(db, models, plan);

    if (cards.length === 0) {
      throw new ApkgError("NO_NOTES", "No notes found in this APKG file.");
    }

    const mediaFiles: Record<string, Uint8Array> = {};
    if (unzipped["media"]) {
      try {
        const mediaMapText = new TextDecoder().decode(unzipped["media"]);
        const mediaMap = JSON.parse(mediaMapText) as Record<string, string>;

        for (const [numStr, origName] of Object.entries(mediaMap)) {
          const isAudio = /\.(mp3|wav|ogg|m4a|aac)$/i.test(origName);
          if (isAudio && unzipped[numStr]) {
            mediaFiles[origName] = unzipped[numStr];
          }
        }
      } catch (mediaErr) {
        console.warn("Failed to parse media map inside APKG:", mediaErr);
      }
    }

    return { cards, deckName, totalNotes, limitReached, mediaFiles };
  } finally {
    db.close();
  }
}

// ---------------------------------------------------------------------------
// Model Extraction
// ---------------------------------------------------------------------------

function extractModels(db: import("sql.js").Database): Map<string, AnkiModel> {
  const models = new Map<string, AnkiModel>();

  // Modern Anki (2.1.28+): models are stored in the `notetypes` table
  // Legacy Anki: models are stored as JSON in `col.models`
  try {
    const notetypesResult = db.exec(
      "SELECT id, name, type FROM notetypes"
    );
    if (notetypesResult.length > 0 && notetypesResult[0].values.length > 0) {
      // Modern format — notetypes table exists
      const fieldsResult = db.exec(
        "SELECT ntid, name, ord FROM fields ORDER BY ord"
      );

      // Build field map: ntid → fields[]
      const fieldMap = new Map<string, Array<{ name: string; ord: number }>>();
      if (fieldsResult.length > 0) {
        for (const row of fieldsResult[0].values) {
          const ntid = String(row[0]);
          const field = { name: String(row[1]), ord: Number(row[2]) };
          const existing = fieldMap.get(ntid) ?? [];
          existing.push(field);
          fieldMap.set(ntid, existing);
        }
      }

      for (const row of notetypesResult[0].values) {
        const id = String(row[0]);
        models.set(id, {
          name: String(row[1]),
          type: Number(row[2]),
          flds: fieldMap.get(id) ?? [],
        });
      }
      return models;
    }
  } catch {
    // notetypes table doesn't exist — try legacy format
  }

  // Legacy format: models stored as JSON in col.models
  try {
    const colResult = db.exec("SELECT models FROM col");
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const modelsJson = String(colResult[0].values[0][0]);
      const parsed = JSON.parse(modelsJson) as Record<string, {
        name: string;
        type?: number;
        flds: Array<{ name: string; ord: number }>;
      }>;

      for (const [id, model] of Object.entries(parsed)) {
        models.set(id, {
          name: model.name,
          type: model.type ?? 0,
          flds: (model.flds ?? []).map((f) => ({
            name: f.name,
            ord: f.ord,
          })),
        });
      }
    }
  } catch {
    // If we can't read models at all, we'll treat everything as basic with 2 fields
  }

  return models;
}

// ---------------------------------------------------------------------------
// Card Extraction
// ---------------------------------------------------------------------------

function extractCards(
  db: import("sql.js").Database,
  models: Map<string, AnkiModel>,
  plan: Plan
): { cards: ParsedApkgCard[]; deckName: string; totalNotes: number; limitReached: boolean } {
  // Verify notes table schema exists to avoid generic runtime errors (e.g. "no such table: notes")
  if (!verifyNotesTableExists(db)) {
    throw new ApkgError("INVALID_APKG_DATABASE", "The notes table does not exist in the collection database.");
  }

  // Try to get the deck name
  const deckName = extractDeckName(db);

  // Safely count total notes
  let totalNotes = 0;
  try {
    const countResult = db.exec("SELECT count(*) FROM notes");
    if (countResult.length > 0 && countResult[0].values.length > 0) {
      totalNotes = Number(countResult[0].values[0][0]);
    }
  } catch (err) {
    console.warn("Failed to retrieve total notes count:", err);
  }

  const cards: ParsedApkgCard[] = [];
  const limit = plan === "free" ? 1000 : Infinity;
  let limitReached = false;

  // Stream notes row-by-row using a prepared statement to optimize memory footprint
  const stmt = db.prepare("SELECT mid, flds FROM notes");
  try {
    while (stmt.step()) {
      if (cards.length >= limit) {
        limitReached = true;
        break;
      }

      const row = stmt.get();
      const modelId = String(row[0]);
      const fieldsRaw = String(row[1]);
      const fields = fieldsRaw.split(FIELD_SEPARATOR);

      const model = models.get(modelId);
      const isClozeModel = model?.type === 1;

      // Filter warning card (placeholder stubs from modern exports)
      const warningText = "Please update to the latest Anki version, then import the .colpkg/.apkg file again.";

      if (isClozeModel) {
        // Flatten cloze notes into individual cards
        const clozeCards = flattenClozeNote(fields[0] ?? "");
        for (const clozeCard of clozeCards) {
          if (cards.length >= limit) {
            limitReached = true;
            break;
          }
          if (clozeCard.front.includes(warningText)) {
            continue;
          }
          cards.push(clozeCard);
        }
      } else {
        // Simplified note mapping:
        // fields[0] -> front
        // fields[1] -> back
        // Acknowledge that this is a simplified model and may not reflect all Anki note types.
        const front = stripAnkiHtml(fields[0] ?? "");
        const back = stripAnkiHtml(fields[1] ?? "");

        if (front.includes(warningText)) {
          continue;
        }

        if (front.trim()) {
          cards.push({ front, back, isCloze: false });
        }
      }
    }
  } finally {
    stmt.free(); // Crucial to release WASM/Emscripten statement locks
  }

  return { cards, deckName, totalNotes, limitReached };
}

// ---------------------------------------------------------------------------
// Deck Name Extraction
// ---------------------------------------------------------------------------

function extractDeckName(db: import("sql.js").Database): string {
  const defaultName = "Imported Deck";

  // Modern Anki: decks table
  try {
    const deckResult = db.exec(
      "SELECT name FROM decks WHERE name != '' LIMIT 1"
    );
    if (deckResult.length > 0 && deckResult[0].values.length > 0) {
      const name = String(deckResult[0].values[0][0]);
      // Strip hierarchy (e.g., "Parent::Child" → "Child")
      const parts = name.split("::");
      return parts[parts.length - 1] ?? defaultName;
    }
  } catch {
    // decks table doesn't exist
  }

  // Legacy Anki: decks stored as JSON in col.decks
  try {
    const colResult = db.exec("SELECT decks FROM col");
    if (colResult.length > 0 && colResult[0].values.length > 0) {
      const decksJson = String(colResult[0].values[0][0]);
      const parsed = JSON.parse(decksJson) as Record<string, { name: string }>;
      const entries = Object.values(parsed).filter(
        (d) => d.name && d.name !== "Default"
      );
      if (entries.length > 0) {
        const name = entries[0].name;
        const parts = name.split("::");
        return parts[parts.length - 1] ?? defaultName;
      }
    }
  } catch {
    // ignore
  }

  return defaultName;
}

// ---------------------------------------------------------------------------
// Cloze Flattening
// ---------------------------------------------------------------------------

/**
 * Converts a cloze note into individual front/back card pairs.
 *
 * Input:  "The {{c1::mitochondria}} is the {{c2::powerhouse}} of the cell"
 * Output: [
 *   { front: "The [...] is the powerhouse of the cell", back: "The mitochondria is the powerhouse of the cell" },
 *   { front: "The mitochondria is the [...] of the cell", back: "The mitochondria is the powerhouse of the cell" },
 * ]
 */
function flattenClozeNote(text: string): ParsedApkgCard[] {
  // Find all cloze deletions and their indices
  const clozes: Array<{ index: number; answer: string; hint?: string }> = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(CLOZE_REGEX);

  while ((match = regex.exec(text)) !== null) {
    clozes.push({
      index: parseInt(match[1], 10),
      answer: match[2],
      hint: match[3],
    });
  }

  if (clozes.length === 0) {
    // No cloze markers found — treat as basic card
    const stripped = stripAnkiHtml(text);
    if (stripped.trim()) {
      return [{ front: stripped, back: "", isCloze: false }];
    }
    return [];
  }

  // Get unique cloze indices
  const uniqueIndices = [...new Set(clozes.map((c) => c.index))].sort(
    (a, b) => a - b
  );

  // The full answer (all clozes revealed) is the back for all cards
  const fullAnswer = stripAnkiHtml(
    text.replace(CLOZE_REGEX, (_m, _i, answer) => answer)
  );

  const cards: ParsedApkgCard[] = [];

  for (const idx of uniqueIndices) {
    // Build the front: replace THIS cloze index with [...], reveal others
    const front = stripAnkiHtml(
      text.replace(
        CLOZE_REGEX,
        (_, clozeIdx, answer, hint) => {
          if (parseInt(clozeIdx, 10) === idx) {
            return hint ? `[${hint}]` : "[...]";
          }
          return answer;
        }
      )
    );

    if (front.trim()) {
      cards.push({ front, back: fullAnswer, isCloze: true });
    }
  }

  return cards;
}

// ---------------------------------------------------------------------------
// HTML Stripping (matches existing stripHtml in csv.ts)
// ---------------------------------------------------------------------------

function stripAnkiHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n") // Preserve line breaks
    .replace(/<[^>]*>/g, "")       // Remove all HTML tags
    .replace(/&nbsp;/g, " ")       // Replace non-breaking spaces
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ---------------------------------------------------------------------------
// Custom Error Class
// ---------------------------------------------------------------------------

export type ApkgErrorCode =
  | "INVALID_FORMAT"
  | "TOO_LARGE"
  | "NO_DATABASE"
  | "PARSE_FAILED"
  | "NO_NOTES"
  | "INVALID_APKG_DATABASE";

export class ApkgError extends Error {
  code: ApkgErrorCode;

  constructor(code: ApkgErrorCode, message: string) {
    super(message);
    this.name = "ApkgError";
    this.code = code;
  }
}
