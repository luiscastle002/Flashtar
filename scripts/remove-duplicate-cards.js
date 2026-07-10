const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'courses');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const pathArg = args.find(arg => arg !== '--dry-run');

// Determine target path to scan
let targetPath = baseDir;
if (pathArg) {
  // Resolve path relative to current directory
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

function run() {
  console.log("Scanning...\n");

  const files = findJsonFiles(targetPath);
  
  let filesScanned = 0;
  let cardsBefore = 0;
  let duplicatesRemoved = 0;
  let cardsAfter = 0;
  let filesModified = 0;

  let currentHeading = "";

  files.forEach(filePath => {
    filesScanned++;

    // Calculate heading (e.g. Japanese/N5) relative to baseDir
    const relPath = path.relative(baseDir, filePath).replace(/\\/g, '/');
    const pathParts = relPath.split('/');
    if (pathParts.length >= 2) {
      const lang = pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1);
      const level = pathParts[1].toUpperCase();
      const heading = `${lang}/${level}`;
      if (heading !== currentHeading) {
        console.log(`${heading}\n`);
        currentHeading = heading;
      }
    }

    let fileContent;
    try {
      fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`Error parsing file ${filePath}:`, err.message);
      return;
    }

    const cards = fileContent.cards || [];
    cardsBefore += cards.length;

    const uniqueKeys = new Set();
    const preservedCards = [];
    let removedInFile = 0;

    for (const card of cards) {
      const normFront = normalizeText(card.front);
      const normBack = normalizeText(card.back);
      const key = `${normFront}||${normBack}`;

      if (uniqueKeys.has(key)) {
        removedInFile++;
      } else {
        uniqueKeys.add(key);
        preservedCards.push(card);
      }
    }

    duplicatesRemoved += removedInFile;
    cardsAfter += preservedCards.length;

    const filename = path.basename(filePath);
    console.log(filename);

    if (removedInFile > 0) {
      filesModified++;
      console.log(`Removed ${removedInFile} duplicate cards\n`);

      if (!isDryRun) {
        // Re-number positions sequentially
        preservedCards.forEach((card, idx) => {
          card.position = idx;
        });
        fileContent.cards = preservedCards;
        fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), 'utf8');
      }
    } else {
      console.log(`✓ No duplicates\n`);
    }
  });

  console.log("---------------------------------\n");
  console.log("Summary\n");
  console.log(`Files scanned: ${filesScanned}\n`);
  console.log(`Cards before: ${cardsBefore}\n`);
  console.log(`Duplicates removed: ${duplicatesRemoved}\n`);
  console.log(`Cards after: ${cardsAfter}\n`);
  console.log(`Files modified: ${filesModified}\n`);
}

run();
