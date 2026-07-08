const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const targets = {
  "introductions": 20,
  "greetings": 25,
  "numbers": 30,
  "dates_time": 35,
  "family": 25,
  "school": 25,
  "shopping": 30,
  "food": 35,
  "animals": 25,
  "transportation": 30,
  "places": 35,
  "colors": 20,
  "adjectives": 40,
  "verbs": 60,
  "weather": 20,
  "kanji": 120,
  "grammar": 55
};

const coursesDir = path.join(__dirname, '..', 'courses');
const n5Dir = path.join(coursesDir, 'japanese', 'n5');

function run() {
  console.log("=== Starting placeholder generation ===");
  let grandTotal = 0;

  for (const [chapter, target] of Object.entries(targets)) {
    const filePath = path.join(n5Dir, `${chapter}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File ${filePath} not found`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.cards) {
      data.cards = [];
    }

    const currentCount = data.cards.length;
    const needed = target - currentCount;

    console.log(`Chapter: ${chapter}`);
    console.log(`  Current cards: ${currentCount}`);
    console.log(`  Target: ${target}`);
    console.log(`  Needed: ${needed}`);

    if (needed > 0) {
      // Find starting position
      let startPos = 0;
      if (currentCount > 0) {
        // Find maximum position to start sequentially
        const maxPos = Math.max(...data.cards.map(c => c.position ?? 0));
        startPos = maxPos + 1;
      }

      for (let i = 0; i < needed; i++) {
        const id = crypto.randomUUID();
        const pos = startPos + i;
        const indexLabel = currentCount + i + 1;
        
        data.cards.push({
          id: id,
          front: `<div class="text-6xl font-bold text-center">Placeholder ${indexLabel}</div>`,
          back: `<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Placeholder</div><div class="text-2xl text-center text-muted-foreground mt-2">placeholder</div>`,
          position: pos
        });
      }

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`  -> Successfully appended ${needed} placeholders to ${chapter}.json`);
    } else {
      console.log(`  -> Chapter already has ${currentCount} cards (target is ${target}). No action taken.`);
    }
    grandTotal += data.cards.length;
  }

  console.log(`\n=== Done! N5 Japanese Curriculum Total Cards: ${grandTotal} ===`);
}

run();
