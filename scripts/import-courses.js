const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Load env variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error("Error: .env.local not found at " + envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseServiceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
});

// 2. Main sync runner
async function syncCourses() {
  const coursesDir = path.join(__dirname, '..', 'courses');
  if (!fs.existsSync(coursesDir)) {
    console.error("Error: courses/ directory not found!");
    process.exit(1);
  }

  // Find all JSON files in the courses directory structure
  const jsonFiles = [];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        jsonFiles.push(fullPath);
      }
    }
  }
  scanDir(coursesDir);

  console.log(`Found ${jsonFiles.length} course data files to import.\n`);

  for (const filePath of jsonFiles) {
    const relativePath = path.relative(path.join(__dirname, '..'), filePath);
    console.log(`=== Processing: ${relativePath} ===`);

    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Failed to parse JSON file ${filePath}:`, err.message);
      continue;
    }

    const { category, deck, cards } = data;

    if (!category || !category.id || !category.name_key) {
      console.error(`Skipping ${relativePath}: Missing category metadata.`);
      continue;
    }
    if (!deck || !deck.id || !deck.name_key) {
      console.error(`Skipping ${relativePath}: Missing deck metadata.`);
      continue;
    }
    if (!cards || !Array.isArray(cards)) {
      console.error(`Skipping ${relativePath}: Missing cards array.`);
      continue;
    }

    // 1. Upsert Category
    console.log(`Upserting category: "${category.name_key}" (${category.id})`);
    const { error: catError } = await supabase
      .from('shared_categories')
      .upsert({
        id: category.id,
        name_key: category.name_key,
        position: category.position ?? 0
      });

    if (catError) {
      console.error(`Failed to upsert category:`, catError.message);
      continue;
    }

    // 2. Upsert Deck
    console.log(`Upserting deck: "${deck.name_key}" (${deck.id})`);
    const { error: deckError } = await supabase
      .from('shared_decks')
      .upsert({
        id: deck.id,
        category_id: category.id,
        name_key: deck.name_key,
        description_key: deck.description_key,
        emoji: deck.emoji,
        color: deck.color,
        difficulty: deck.difficulty,
        language: deck.language,
        card_count: cards.length,
        position: deck.position ?? 0
      });

    if (deckError) {
      console.error(`Failed to upsert deck:`, deckError.message);
      continue;
    }

    // 3. Query existing cards for this deck to preserve audio URLs
    console.log(`Fetching existing cards for deck ${deck.id} to preserve audios...`);
    const { data: existingCards, error: fetchError } = await supabase
      .from('shared_cards')
      .select('id, front_audio_url, back_audio_url')
      .eq('shared_deck_id', deck.id);

    if (fetchError) {
      console.error(`Warning: Failed to fetch existing cards:`, fetchError.message);
    }

    const audioMap = new Map();
    if (existingCards) {
      existingCards.forEach(c => {
        audioMap.set(c.id, {
          front_audio_url: c.front_audio_url,
          back_audio_url: c.back_audio_url
        });
      });
    }

    // 4. Delete orphan/old cards that are NOT in the incoming JSON
    const incomingIds = cards.map(c => c.id).filter(Boolean);
    if (incomingIds.length > 0) {
      console.log(`Cleaning up old cards for deck ${deck.id}...`);
      const { error: deleteError } = await supabase
        .from('shared_cards')
        .delete()
        .eq('shared_deck_id', deck.id)
        .not('id', 'in', `(${incomingIds.join(',')})`);

      if (deleteError) {
        console.error(`Warning: Failed to delete old cards:`, deleteError.message);
      }
    } else {
      console.log(`Cleaning up all cards for deck ${deck.id}...`);
      const { error: deleteError } = await supabase
        .from('shared_cards')
        .delete()
        .eq('shared_deck_id', deck.id);

      if (deleteError) {
        console.error(`Warning: Failed to delete old cards:`, deleteError.message);
      }
    }

    // 5. Build cards upsert payload with preserved audios
    const cardRows = cards.map(card => {
      const existingAudio = audioMap.get(card.id) || {};
      return {
        id: card.id,
        shared_deck_id: deck.id,
        front: card.front,
        back: card.back,
        position: card.position,
        front_audio_url: existingAudio.front_audio_url || null,
        back_audio_url: existingAudio.back_audio_url || null
      };
    });

    // 6. Bulk upsert cards
    console.log(`Upserting ${cardRows.length} cards...`);
    const { error: cardsError } = await supabase
      .from('shared_cards')
      .upsert(cardRows);

    if (cardsError) {
      console.error(`Failed to upsert cards for deck ${deck.id}:`, cardsError.message);
      continue;
    }

    console.log(`Successfully synchronized "${deck.name_key}" with ${cardRows.length} cards.\n`);
  }

  console.log("=== All courses synchronized successfully! ===");
}

syncCourses().catch(err => {
  console.error("Fatal error during sync execution:", err);
  process.exit(1);
});
