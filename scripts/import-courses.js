const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// 1. Load env variables from .env.local
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env.local not found at " + envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env["NEXT_PUBLIC_SUPABASE_URL"];
const supabaseServiceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
});

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg"];

const officialAudioSource =
  env["OFFICIAL_COURSE_AUDIO_SOURCE"] ||
  path.join(__dirname, "..", "public", "audio", "courses");

/**
 * Resolves the path of the official course audio.
 * Future-proofed for CDN/Supabase Storage redirection.
 */
function resolveOfficialAudio(course, level, cardId, existingAudioUrl) {
  for (const ext of AUDIO_EXTENSIONS) {
    const localAbsPath = path.join(
      officialAudioSource,
      course,
      level,
      `${cardId}${ext}`,
    );
    if (fs.existsSync(localAbsPath)) {
      return `audio/${course}/${level}/${cardId}${ext}`;
    }
  }
  return existingAudioUrl || null;
}

// 2. Main sync runner
async function syncCourses() {
  const coursesDir = path.join(__dirname, "..", "courses");
  if (!fs.existsSync(coursesDir)) {
    console.error("Error: courses/ directory not found!");
    process.exit(1);
  }

  let grandTotalCards = 0;
  let grandTotalLinked = 0;
  let grandTotalMissing = 0;
  const deckStats = [];
  const missingDetails = [];

  // Reorganize JSON scanning to support multi-file (chapter-based) decks using deck.json
  const courseDecks = [];

  function scanForDecks(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    // Check if deck.json exists in this directory
    const hasDeckJson = entries.some(
      (e) => e.isFile() && e.name === "deck.json",
    );

    if (hasDeckJson) {
      // 1. Multi-file deck: load deck and category metadata from deck.json
      const deckJsonPath = path.join(dir, "deck.json");
      let deckMetadata;
      try {
        deckMetadata = JSON.parse(fs.readFileSync(deckJsonPath, "utf8"));
      } catch (err) {
        console.error(`Failed to parse deck.json in ${dir}:`, err.message);
        return;
      }

      const { category, deck } = deckMetadata;
      if (!category || !deck) {
        console.error(
          `Invalid deck.json in ${dir}: missing category or deck metadata.`,
        );
        return;
      }

      // Load and sort all chapter files in this directory (exclude deck.json itself)
      const cards = [];
      const parsedChapters = [];

      for (const entry of entries) {
        if (
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== "deck.json"
        ) {
          const chapPath = path.join(dir, entry.name);
          try {
            const chapData = JSON.parse(fs.readFileSync(chapPath, "utf8"));
            parsedChapters.push({ file: entry.name, data: chapData });
          } catch (err) {
            console.error(
              `Failed to parse chapter file ${entry.name} in ${dir}:`,
              err.message,
            );
          }
        }
      }

      // Sort chapters by their defined position
      parsedChapters.sort(
        (a, b) => (a.data.position ?? 0) - (b.data.position ?? 0),
      );

      // Combine cards from all chapters and assign global positions
      let globalPosition = 0;
      for (const chap of parsedChapters) {
        if (chap.data.cards && Array.isArray(chap.data.cards)) {
          const sortedCards = [...chap.data.cards].sort(
            (a, b) => (a.position ?? 0) - (b.position ?? 0),
          );
          for (const card of sortedCards) {
            cards.push({
              ...card,
              position: globalPosition++,
            });
          }
        }
      }

      const relPath = path.relative(coursesDir, dir);
      courseDecks.push({
        relativePath: relPath,
        category,
        deck,
        cards,
      });

      // Recurse into subdirectories if they exist
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanForDecks(path.join(dir, entry.name));
        }
      }
    } else {
      // 2. Standalone deck files or intermediate category folders
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanForDecks(fullPath);
        } else if (
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== "deck.json"
        ) {
          let data;
          try {
            data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
          } catch (err) {
            console.error(
              `Failed to parse standalone JSON file ${fullPath}:`,
              err.message,
            );
            continue;
          }

          const { category, deck, cards } = data;
          if (category && deck && cards) {
            courseDecks.push({
              relativePath: path.relative(coursesDir, fullPath),
              category,
              deck,
              cards,
            });
          }
        }
      }
    }
  }

  scanForDecks(coursesDir);

  console.log(`Found ${courseDecks.length} decks to sync.\n`);

  for (const { relativePath, category, deck, cards } of courseDecks) {
    console.log(`\n=================================================`);
    console.log(`Deck: ${deck.name_key}  (${relativePath})`);
    console.log(`=================================================`);

    const normalizedPath = relativePath.replace(/\\/g, "/");
    const pathParts = normalizedPath.split("/");
    const course = pathParts[0];
    const level = pathParts[1];

    let deckFoundCount = 0;
    let deckTotalCount = cards.length;

    // 1. Upsert Category
    const { error: catError } = await supabase
      .from("shared_categories")
      .upsert({
        id: category.id,
        name_key: category.name_key,
        position: category.position ?? 0,
      });

    if (catError) {
      console.error(`Failed to upsert category:`, catError.message);
      continue;
    }

    // 2. Upsert Deck
    const { error: deckError } = await supabase.from("shared_decks").upsert({
      id: deck.id,
      category_id: category.id,
      name_key: deck.name_key,
      description_key: deck.description_key,
      emoji: deck.emoji,
      color: deck.color,
      difficulty: deck.difficulty,
      language: deck.language,
      card_count: cards.length,
      position: deck.position ?? 0,
    });

    if (deckError) {
      console.error(`Failed to upsert deck:`, deckError.message);
      continue;
    }

    // 3. Query existing cards for this deck to preserve audio URLs
    const { data: existingCards, error: fetchError } = await supabase
      .from("shared_cards")
      .select("id, front_audio_url, back_audio_url")
      .eq("shared_deck_id", deck.id);

    if (fetchError) {
      console.error(
        `Warning: Failed to fetch existing cards:`,
        fetchError.message,
      );
    }

    const audioMap = new Map();
    if (existingCards) {
      existingCards.forEach((c) => {
        audioMap.set(c.id, {
          front_audio_url: c.front_audio_url,
          back_audio_url: c.back_audio_url,
        });
      });
    }

    // 5. Build cards upsert payload with preserved audios
    const incomingIds = cards.map((c) => c.id).filter(Boolean);
    const incomingIdsSet = new Set(incomingIds);

    const cardRows = cards.map((card) => {
      const existingAudio = audioMap.get(card.id) || {};
      const frontAudioUrl = resolveOfficialAudio(
        course,
        level,
        card.id,
        existingAudio.front_audio_url,
      );

      if (frontAudioUrl) {
        deckFoundCount++;
      } else {
        missingDetails.push({
          deckName: deck.name_key,
          cardId: card.id,
          front: card.front,
        });
      }

      return {
        id: card.id,
        shared_deck_id: deck.id,
        front: card.front,
        back: card.back,
        position: card.position,
        front_audio_url: frontAudioUrl,
        back_audio_url: existingAudio.back_audio_url || null,
      };
    });

    // 6. Bulk upsert cards
    const { error: cardsError } = await supabase
      .from("shared_cards")
      .upsert(cardRows);

    if (cardsError) {
      console.error(
        `Failed to upsert cards for deck ${deck.id}:`,
        cardsError.message,
      );
      continue;
    }

    // 7. Delete obsolete cards after upsert.
    // Fetch the DB state after the upsert to find rows that are no longer
    // in the JSON source and should be removed.
    const { data: existingCardsAfter, error: fetchAfterError } = await supabase
      .from("shared_cards")
      .select("id")
      .eq("shared_deck_id", deck.id);

    let obsoleteRemoved = 0;
    const dbBefore = existingCardsAfter ? existingCardsAfter.length : cardRows.length;

    if (fetchAfterError) {
      console.error(
        `Warning: Failed to fetch cards for cleanup:`,
        fetchAfterError.message,
      );
    } else if (existingCardsAfter) {
      const existingIds = existingCardsAfter.map((c) => c.id);
      const idsToDelete = existingIds.filter((id) => !incomingIdsSet.has(id));
      if (idsToDelete.length > 0) {
        const { error: delError } = await supabase
          .from("shared_cards")
          .delete()
          .eq("shared_deck_id", deck.id)
          .in("id", idsToDelete);
        if (delError) {
          console.error(
            `Warning: Failed to delete obsolete cards:`,
            delError.message,
          );
        } else {
          // Supabase JS does not reliably return a row count for deletes.
          // idsToDelete.length is always accurate because we computed it
          // from a fresh fetch immediately before the delete.
          obsoleteRemoved = idsToDelete.length;
        }
      }
    }

    const dbAfter = dbBefore - obsoleteRemoved;
    const pad = (n) => String(n).padStart(6);
    console.log(`
  JSON cards:          ${pad(cardRows.length)}
  DB before:           ${pad(dbBefore)}
  Upserted:            ${pad(cardRows.length)}
  Deleted obsolete:    ${pad(obsoleteRemoved)}
  DB after:            ${pad(dbAfter)}
`);

    deckStats.push({
      deckName: deck.name_key,
      found: deckFoundCount,
      total: deckTotalCount,
    });

    grandTotalCards += deckTotalCount;
    grandTotalLinked += deckFoundCount;
    grandTotalMissing += deckTotalCount - deckFoundCount;
  }

  console.log("\n===============================================");
  console.log("Official Audio Scan Report");
  console.log("===============================================\n");

  deckStats.forEach((stat) => {
    console.log(`${stat.deckName}:`);
    console.log(`  ${stat.found} / ${stat.total} audio files found\n`);
  });

  console.log("-----------------------------------------------");
  console.log(`Total cards:   ${grandTotalCards}`);
  console.log(`Audio linked:  ${grandTotalLinked}`);
  console.log(`Missing audio: ${grandTotalMissing}`);
  console.log("-----------------------------------------------\n");

  if (missingDetails.length > 0) {
    console.log("Warning: Missing Audio Details:");
    const groupedMissing = {};
    missingDetails.forEach((m) => {
      if (!groupedMissing[m.deckName]) {
        groupedMissing[m.deckName] = [];
      }
      groupedMissing[m.deckName].push(m);
    });

    for (const [deckName, list] of Object.entries(groupedMissing)) {
      console.log(`\nDeck: ${deckName}`);
      list.forEach((m) => {
        const cleanFront = m.front.replace(/<[^>]*>/g, "");
      });
    }
    console.log("");
  }

  console.log("=== All courses synchronized successfully! ===");
}

syncCourses().catch((err) => {
  console.error("Fatal error during sync execution:", err);
  process.exit(1);
});
