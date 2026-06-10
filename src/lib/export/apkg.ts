import type { Flashcard } from "@/types";
import { loadSql } from "@/lib/sql/initSql";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function getAnkiModel(cardType: string): { name: string; fields: string[]; templates: string } {
  if (cardType === "cloze") {
    return {
      name: "Cloze",
      fields: ["Text", "Extra"],
      templates: `<div class="front">{{cloze:Text}}</div><div class="extra">{{Extra}}</div>`,
    };
  }
  return {
    name: "Basic",
    fields: ["Front", "Back"],
    templates: `<div class="front">{{Front}}</div><hr><div class="back">{{Back}}</div>`,
  };
}

export async function buildApkg(deckName: string, cards: Flashcard[]): Promise<Uint8Array> {
  const SQL = await loadSql();

  const db = new SQL.Database();
  const now = Math.floor(Date.now() / 1000);
  const deckId = now;
  const modelId = now + 1;
  const primaryCardType = cards[0]?.card_type === "cloze" ? "cloze" : "basic";
  const model = getAnkiModel(primaryCardType);

  db.run(`
    CREATE TABLE col (
      id integer PRIMARY KEY,
      crt integer NOT NULL,
      mod integer NOT NULL,
      scm integer NOT NULL,
      ver integer NOT NULL,
      dty integer NOT NULL,
      usn integer NOT NULL,
      ls integer NOT NULL,
      conf text NOT NULL,
      models text NOT NULL,
      decks text NOT NULL,
      dconf text NOT NULL,
      tags text NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE notes (
      id integer PRIMARY KEY,
      guid text NOT NULL,
      mid integer NOT NULL,
      mod integer NOT NULL,
      usn integer NOT NULL,
      tags text NOT NULL,
      flds text NOT NULL,
      sfld integer NOT NULL,
      csum integer NOT NULL,
      flags integer NOT NULL,
      data text NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE cards (
      id integer PRIMARY KEY,
      nid integer NOT NULL,
      did integer NOT NULL,
      ord integer NOT NULL,
      mod integer NOT NULL,
      usn integer NOT NULL,
      type integer NOT NULL,
      queue integer NOT NULL,
      due integer NOT NULL,
      ivl integer NOT NULL,
      factor integer NOT NULL,
      reps integer NOT NULL,
      lapses integer NOT NULL,
      left integer NOT NULL,
      odue integer NOT NULL,
      odid integer NOT NULL,
      flags integer NOT NULL,
      data text NOT NULL
    )
  `);

  const models = JSON.stringify({
    [modelId]: {
      id: modelId,
      name: model.name,
      type: primaryCardType === "cloze" ? 1 : 0,
      flds: model.fields.map((name, i) => ({ name, ord: i, sticky: false, rtl: false, font: "Arial", size: 20 })),
      tmpls: [
        {
          name: "Card 1",
          ord: 0,
          qfmt: model.templates,
          afmt: model.templates,
          bqfmt: "",
          bafmt: "",
        },
      ],
      css: ".card { font-family: arial; font-size: 20px; }",
    },
  });

  const decks = JSON.stringify({
    [deckId]: {
      id: deckId,
      name: deckName,
      desc: "",
      mod: now,
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
      extendNew: 0,
      extendRev: 0,
      dyn: 0,
      conf: 1,
    },
    1: {
      id: 1,
      name: "Default",
      desc: "",
      mod: now,
      usn: 0,
      collapsed: false,
      browserCollapsed: false,
      extendNew: 0,
      extendRev: 0,
      dyn: 0,
      conf: 1,
    },
  });

  db.run(
    `INSERT INTO col VALUES (1, ?, ?, ?, 11, 0, 0, 0, '{}', ?, ?, '{}', '{}')`,
    [now, now, now, models, decks]
  );

  cards.forEach((card, index) => {
    const noteId = now + 1000 + index;
    const cardId = now + 2000 + index;
    const front = stripHtml(card.front);
    const back = stripHtml(card.back);
    const isCloze = card.card_type === "cloze";
    const flds = isCloze ? `${front}\x1f${back}` : `${front}\x1f${back}`;
    const guid = `ankiai-${noteId}-${index}`;

    db.run(
      `INSERT INTO notes VALUES (?, ?, ?, ?, 0, '', ?, 0, 0, 0, '')`,
      [noteId, guid, modelId, now, flds]
    );

    db.run(
      `INSERT INTO cards VALUES (?, ?, ?, 0, ?, 0, 0, 0, ?, 0, 2500, 0, 0, 0, 0, 0, 0, '')`,
      [cardId, noteId, deckId, now, noteId]
    );
  });

  const sqliteData = db.export();
  db.close();

  return createApkgZip(deckName, sqliteData);
}

async function createApkgZip(deckName: string, sqliteData: Uint8Array): Promise<Uint8Array> {
  const collectionBytes = sqliteData;
  const mediaJson = "{}";
  const metaJson = JSON.stringify({
    crt: Math.floor(Date.now() / 1000),
    mod: Math.floor(Date.now() / 1000),
    scm: Math.floor(Date.now() / 1000),
    ver: 11,
    dty: 0,
    usn: 0,
    ls: 0,
  });

  const files: { name: string; data: Uint8Array }[] = [
    { name: "collection.anki2", data: collectionBytes },
    { name: "media", data: new TextEncoder().encode(mediaJson) },
    { name: "meta", data: new TextEncoder().encode(metaJson) },
  ];

  return buildZip(files);
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const localHeader = createLocalFileHeader(nameBytes, file.data.length, crc);
    parts.push(localHeader, nameBytes, file.data);

    centralDirectory.push(createCentralDirectoryHeader(nameBytes, file.data.length, crc, offset));
    offset += localHeader.length + nameBytes.length + file.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDirectory) {
    parts.push(cd);
    cdSize += cd.length;
  }

  const endRecord = createEndOfCentralDirectory(files.length, cdSize, cdOffset);
  parts.push(endRecord);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  return result;
}

function createLocalFileHeader(nameBytes: Uint8Array, size: number, crc: number): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function createCentralDirectoryHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  offset: number
): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  const result = new Uint8Array(header.length + nameBytes.length);
  result.set(header);
  result.set(nameBytes, header.length);
  return result;
}

function createEndOfCentralDirectory(
  fileCount: number,
  cdSize: number,
  cdOffset: number
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, cdSize, true);
  view.setUint32(16, cdOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function downloadApkg(filename: string, data: Uint8Array) {
  const blob = new Blob([new Uint8Array(data)], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".apkg") ? filename : `${filename}.apkg`;
  link.click();
  URL.revokeObjectURL(url);
}
