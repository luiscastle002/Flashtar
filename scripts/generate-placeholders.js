const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const baseDir = path.join(__dirname, '..', 'courses');

const targetLanguages = {
  japanese: ['n4', 'n3', 'n2', 'n1'],
  english: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  spanish: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']
};

const TARGET_CARDS_PER_CHAPTER = 50;

function run() {
  let filesModified = 0;
  let cardsGenerated = 0;

  for (const [lang, levels] of Object.entries(targetLanguages)) {
    console.log(`\nProcessing language: ${lang}`);
    const langPath = path.join(baseDir, lang);

    if (!fs.existsSync(langPath)) {
      console.warn(`Warning: Language path does not exist: ${langPath}`);
      continue;
    }

    levels.forEach(level => {
      const levelPath = path.join(langPath, level);
      if (!fs.existsSync(levelPath)) {
        console.warn(`Warning: Level path does not exist: ${levelPath}`);
        return;
      }

      const files = fs.readdirSync(levelPath);
      files.forEach(file => {
        if (file.endsWith('.json') && file !== 'deck.json') {
          const filePath = path.join(levelPath, file);
          let content;

          try {
            content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch (err) {
            console.error(`Error reading/parsing ${filePath}:`, err.message);
            return;
          }

          if (!content.cards) {
            content.cards = [];
          }

          const existingCount = content.cards.length;
          if (existingCount < TARGET_CARDS_PER_CHAPTER) {
            const toGenerate = TARGET_CARDS_PER_CHAPTER - existingCount;
            console.log(`- ${lang}/${level}/${file}: existing cards = ${existingCount}, generating ${toGenerate} placeholders...`);

            for (let i = 0; i < toGenerate; i++) {
              const position = existingCount + i;
              const cardId = crypto.randomUUID();
              
              content.cards.push({
                id: cardId,
                front: `<div class="text-6xl font-bold text-center">Placeholder ${position + 1}</div>`,
                back: `<div class="text-4xl text-center"><span class="text-muted-foreground text-lg block">Meaning</span>Placeholder</div><div class="text-2xl text-center text-muted-foreground mt-2">placeholder</div>`,
                position: position
              });
            }

            fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
            filesModified++;
            cardsGenerated += toGenerate;
          } else {
            console.log(`- ${lang}/${level}/${file}: already has ${existingCount} cards (>= 50), skipping generation.`);
          }
        }
      });
    });
  }

  console.log('\n========================================');
  console.log('Placeholder Generation Summary');
  console.log('========================================');
  console.log(`Files modified:   ${filesModified}`);
  console.log(`Cards generated:  ${cardsGenerated}`);
  console.log('========================================\n');
}

run();
