const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'courses');

// 1. Defined Level Pedagogical Progression
const LEVEL_ORDERS = {
  japanese: ['hiragana', 'katakana', 'n5', 'n4', 'n3', 'n2', 'n1'],
  english: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'],
  spanish: ['a1', 'a2', 'b1', 'b2', 'c1', 'c2']
};

// 2. Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const wantsReport = args.includes('--report');

let ignoredFronts = new Set();

// Parse ignore argument
const ignoreIdx = args.indexOf('--ignore');
if (ignoreIdx !== -1 && ignoreIdx + 1 < args.length) {
  const list = args[ignoreIdx + 1];
  list.split(',').forEach(item => {
    ignoredFronts.add(normalizeText(item));
  });
}

// Parse ignore.json if it exists
if (fs.existsSync('ignore.json')) {
  try {
    const fileContent = JSON.parse(fs.readFileSync('ignore.json', 'utf8'));
    if (Array.isArray(fileContent)) {
      fileContent.forEach(item => {
        ignoredFronts.add(normalizeText(item));
      });
    }
  } catch (err) {
    console.warn(`Warning: failed to parse ignore.json: ${err.message}`);
  }
}

// Extract path argument
const cleanArgs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run' || args[i] === '--report') continue;
  if (args[i] === '--ignore') {
    i++; // skip value
    continue;
  }
  cleanArgs.push(args[i]);
}
const pathArg = cleanArgs[0];

// Determine target path to scan
let targetPath = baseDir;
if (pathArg) {
  targetPath = path.resolve(process.cwd(), pathArg);
}

function normalizeText(text) {
  if (!text) return "";
  
  // 1. Remove HTML tags
  let result = text.replace(/<\/?[^>]+(>|$)/g, "");
  
  // 2. Decode HTML entities
  result = result
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");

  // 3. Trim and collapse repeated whitespace
  result = result.trim().replace(/\s+/g, " ");

  return result.toLowerCase();
}

function findJsonFiles(dirOrFile) {
  if (!fs.existsSync(dirOrFile)) {
    return [];
  }
  const stat = fs.statSync(dirOrFile);
  if (stat.isFile()) {
    if (dirOrFile.endsWith('.json') && path.basename(dirOrFile) !== 'deck.json') {
      return [dirOrFile];
    }
    return [];
  }
  
  let results = [];
  const entries = fs.readdirSync(dirOrFile, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirOrFile, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findJsonFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'deck.json') {
      results.push(fullPath);
    }
  }
  return results;
}

// Compare two occurrences based on pedagogical progression order
function compareOccurrences(a, b) {
  const course = (a.course || '').toLowerCase();
  const levelsList = LEVEL_ORDERS[course] || [];
  
  const idxA = levelsList.indexOf((a.level || '').toLowerCase());
  const idxB = levelsList.indexOf((b.level || '').toLowerCase());
  
  const valA = idxA === -1 ? 999 : idxA;
  const valB = idxB === -1 ? 999 : idxB;
  
  if (valA !== valB) {
    return valA - valB;
  }
  
  // Levels are equal, fallback to alphabetical Level comparison if not found in list
  if (idxA === -1 && idxB === -1) {
    const lvlCmp = (a.level || '').localeCompare(b.level || '');
    if (lvlCmp !== 0) return lvlCmp;
  }
  
  // Compare chapter position
  if (a.chapterPosition !== b.chapterPosition) {
    return a.chapterPosition - b.chapterPosition;
  }
  
  // Compare chapter names alphabetically for absolute determinism
  const chCmp = (a.chapter || '').localeCompare(b.chapter || '');
  if (chCmp !== 0) return chCmp;
  
  // Compare card position
  return a.cardPosition - b.cardPosition;
}

function run() {
  // Print dynamic Scanning message
  let scanMessage = "Scanning...";
  const relTargetPath = path.relative(baseDir, targetPath).replace(/\\/g, '/');
  if (relTargetPath && relTargetPath !== '..') {
    const parts = relTargetPath.split('/');
    if (parts.length >= 2) {
      const lang = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      const level = parts[1].toUpperCase();
      scanMessage = `Scanning ${lang} ${level}...`;
    } else if (parts.length === 1 && parts[0]) {
      const lang = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
      scanMessage = `Scanning ${lang} courses...`;
    }
  } else {
    scanMessage = `Scanning all courses...`;
  }
  console.log(scanMessage + "\n");

  const files = findJsonFiles(targetPath);
  
  // Group all card occurrences by course -> normalizedFront
  const courseFrontMaps = {};
  let cardsBeforeCount = 0;

  files.forEach(filePath => {
    let content;
    try {
      content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Error parsing file ${filePath}:`, err.message);
      return;
    }

    const course = (content.course || 'default').toLowerCase();
    if (!courseFrontMaps[course]) {
      courseFrontMaps[course] = {};
    }

    const cards = content.cards || [];
    cardsBeforeCount += cards.length;

    cards.forEach(card => {
      const normFront = normalizeText(card.front);
      
      // Skip if ignored
      if (ignoredFronts.has(normFront)) {
        return;
      }

      if (!courseFrontMaps[course][normFront]) {
        courseFrontMaps[course][normFront] = [];
      }

      courseFrontMaps[course][normFront].push({
        filePath,
        fileName: path.basename(filePath),
        course: content.course,
        level: content.level,
        chapter: content.chapter,
        chapterTitle: content.title || content.chapter,
        chapterPosition: content.position || 0,
        cardPosition: card.position,
        card: card
      });
    });
  });

  const cardIdsToRemove = new Set();
  const reportDuplicates = [];
  let duplicatesFound = 0;

  // Process duplicates
  for (const [course, frontMap] of Object.entries(courseFrontMaps)) {
    for (const [normFront, occurrences] of Object.entries(frontMap)) {
      if (occurrences.length > 1) {
        duplicatesFound++;

        // Sort by pedagogical priority
        occurrences.sort(compareOccurrences);

        const kept = occurrences[0];
        const removedList = [];

        console.log("Duplicate found\n");
        console.log(`Front:\n${kept.card.front.replace(/<\/?[^>]+(>|$)/g, "").trim()}\n`);

        const keptLang = kept.course.charAt(0).toUpperCase() + kept.course.slice(1);
        const keptLevel = kept.level.toUpperCase();
        console.log("Kept:");
        console.log(`${keptLang} / ${keptLevel} / ${kept.chapterTitle} / position ${kept.cardPosition}\n`);

        for (let i = 1; i < occurrences.length; i++) {
          const removed = occurrences[i];
          cardIdsToRemove.add(removed.card.id);
          removedList.push(removed);

          const remLang = removed.course.charAt(0).toUpperCase() + removed.course.slice(1);
          const remLevel = removed.level.toUpperCase();
          console.log("Removed:");
          console.log(`${remLang} / ${remLevel} / ${removed.chapterTitle} / position ${removed.cardPosition}\n`);
        }

        console.log("Reason:\nEarlier occurrence in curriculum\n");
        console.log("--------------------------------\n");

        if (wantsReport) {
          reportDuplicates.push({
            front: kept.card.front.replace(/<\/?[^>]+(>|$)/g, "").trim(),
            kept: {
              file: path.relative(baseDir, kept.filePath).replace(/\\/g, '/'),
              id: kept.card.id,
              position: kept.cardPosition
            },
            removed: removedList.map(rem => ({
              file: path.relative(baseDir, rem.filePath).replace(/\\/g, '/'),
              id: rem.card.id,
              position: rem.cardPosition
            }))
          });
        }
      }
    }
  }

  // Deletion phase
  let filesModifiedCount = 0;
  if (cardIdsToRemove.size > 0) {
    files.forEach(filePath => {
      let content;
      try {
        content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (e) {
        return;
      }

      const cards = content.cards || [];
      const remainingCards = cards.filter(card => !cardIdsToRemove.has(card.id));

      if (remainingCards.length < cards.length) {
        filesModifiedCount++;
        
        if (!isDryRun) {
          // Renumber positions sequentially
          remainingCards.forEach((card, idx) => {
            card.position = idx;
          });
          content.cards = remainingCards;
          fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');
        }
      }
    });
  }

  const cardsAfterCount = cardsBeforeCount - cardIdsToRemove.size;

  // Print summary
  console.log("Summary\n");
  console.log(`Files scanned: ${files.length}\n`);
  console.log(`Cards before: ${cardsBeforeCount}\n`);
  console.log(`Global duplicate vocabulary removed: ${cardIdsToRemove.size}\n`);
  console.log(`Cards after: ${cardsAfterCount}\n`);

  // Write report JSON if requested
  if (wantsReport) {
    const reportData = {
      duplicatesRemoved: cardIdsToRemove.size,
      cardsBefore: cardsBeforeCount,
      cardsAfter: cardsAfterCount,
      duplicates: reportDuplicates
    };
    fs.writeFileSync('duplicate-report.json', JSON.stringify(reportData, null, 2), 'utf8');
    console.log(`Wrote duplicate-report.json\n`);
  }
}

run();
