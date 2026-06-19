import { getDocumentProxy, extractText } from "unpdf";
import mammoth from "mammoth";
import officeParser from "officeparser";
import * as XLSX from "xlsx";
import { isYouTubeUrl, getYouTubeVideoId } from "./youtube-parser";
import { TranscriptService, YoutubeImportError } from "./youtube-providers";
import { getCachedTranscript, saveCachedTranscript, logYoutubeImportAnalytics } from "./youtube-cache";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { isSafeUrl } from "./ssrf-validator";

function logExtractorStep(stepNum: number, stepText: string, extra: Record<string, unknown> = {}) {
  const mem = process.memoryUsage();
  console.log(
    `[${stepNum}] ${stepText} | Time: ${Date.now()} | Perf: ${performance.now().toFixed(2)}ms | RSS: ${Math.round(
      mem.rss / 1024 / 1024
    )}MB | HeapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    extra
  );
}

/**
 * Extracts raw text from a document or text file in-memory.
 */
export async function extractTextFromFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "txt":
      return parseTxt(buffer);
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "pptx":
      return parsePptx(buffer);
    case "xlsx":
      return parseXlsx(buffer);
    case "png":
    case "jpg":
    case "jpeg":
    case "webp":
      return extractTextFromImage(buffer, mimeType);
    default:
      throw new Error("This file type is not supported.");
  }
}

function parseTxt(buffer: Buffer): string {
  const text = buffer.toString("utf-8");
  return text.slice(0, 50000); // Max 50,000 characters
}

async function parsePdf(buffer: Buffer): Promise<string> {
  // Parse PDF only up to the first 15 pages in-memory
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  // Slice to max 15 pages and join
  const slicedText = pages.slice(0, 15).join("\n\n");
  return slicedText || "";
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value || "";
  return text.slice(0, 50000); // Max 50,000 characters
}

async function parsePptx(buffer: Buffer): Promise<string> {
  // officeparser returns the text content of the slides
  const ast = await officeParser.parseOffice(buffer, { fileType: "pptx" });
  // In officeparser v6, the AST.toText() converts slides to plain text
  const text = typeof ast.toText === "function" ? ast.toText() : String(ast);
  
  // Custom limit: Process slide contents (roughly truncate slides)
  return text.slice(0, 50000);
}

function parseXlsx(buffer: Buffer): string {
  // Validate magic numbers (ZIP archive signature: PK\x03\x04)
  if (
    buffer.length < 4 ||
    buffer[0] !== 0x50 || // 'P'
    buffer[1] !== 0x4B || // 'K'
    buffer[2] !== 0x03 || // \x03
    buffer[3] !== 0x04    // \x04
  ) {
    throw new Error("Invalid Excel file. The file signature does not match a valid OpenXML spreadsheet.");
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: false, // Disables formula evaluation (prevents ReDoS/pollution)
    cellHTML: false,    // Disables HTML parsing
    sheetRows: 505      // Stop parsing after 505 rows (limits memory usage)
  });
  let extractedText = "";

  // Process first 10 sheets
  const sheetNames = workbook.SheetNames.slice(0, 10);
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    // Convert worksheet rows to array of arrays
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
    
    // Process first 500 rows per sheet
    const limitedRows = rows.slice(0, 500);

    extractedText += `Sheet: ${sheetName}\n`;
    for (const row of limitedRows) {
      if (Array.isArray(row)) {
        const rowText = row
          .map((cell) => (cell !== null && cell !== undefined ? String(cell) : ""))
          .join("\t");
        extractedText += rowText + "\n";
      }
    }
    extractedText += "\n";
  }

  return extractedText;
}

/**
 * Image Processing Strategy:
 * Sends the base64 image data directly to OpenAI GPT-4o-mini Vision model to extract text.
 */
async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  logExtractorStep(6, "Starting GPT Vision extraction", { mimeType, size: buffer.length });
  const text = await extractTextWithGPTVision(buffer, mimeType);
  logExtractorStep(7, "GPT Vision extraction finished", { textLength: text.length });
  return text;
}

async function extractTextWithGPTVision(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  const openai = new OpenAI({ apiKey });

  const base64Image = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  console.log("extractTextWithGPTVision: Requesting GPT Vision...");
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Cost-effective model with vision support
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract and transcribe all readable educational text from this image. Output only the extracted text, formatting it cleanly without any preamble or conversational text.",
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
            },
          },
        ],
      },
    ],
    max_tokens: 1500,
  });

  console.log("extractTextWithGPTVision: GPT Vision finished.");
  return response.choices[0]?.message?.content || "";
}

/**
 * Downsamples text to fit within a maximum character limit by keeping the introduction,
 * outro, and uniformly sampling the sentences in between.
 */
export function downsampleText(text: string, maxChars: number = 45000): string {
  if (text.length <= maxChars) {
    return text;
  }

  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || text.split(/(?<=[.!?])\s+/);
  if (!sentences || sentences.length === 0) {
    return text.slice(0, maxChars);
  }

  const totalLength = text.length;
  const ratio = maxChars / totalLength;
  const everyN = Math.max(1, Math.floor(1 / ratio));

  const selectedSentences: string[] = [];
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    // Keep intro (first 5 sentences), outro (last 5 sentences), and sample in between
    if (i < 5 || i > sentences.length - 6 || i % everyN === 0) {
      const sentence = sentences[i];
      if (currentLength + sentence.length > maxChars) {
        break;
      }
      selectedSentences.push(sentence);
      currentLength += sentence.length;
    }
  }

  return selectedSentences.join(" ").trim();
}

/**
 * Retrieves the YouTube transcript, downsamples it if too long, and registers it.
 */
async function extractYouTubeTranscript(
  videoId: string,
  languageCode?: string,
  userId?: string
): Promise<string> {
  const startTime = Date.now();
  const targetLang = languageCode || "en";
  let success = false;
  let providerUsed = "None";
  let errorCode: string | null = null;
  const attempts = 1;
  let rawTranscript = "";

  try {
    // 1. Check cache first
    const cached = await getCachedTranscript(videoId, targetLang);
    if (cached) {
      success = true;
      providerUsed = "DatabaseCache";
      rawTranscript = cached.content;
      return downsampleText(rawTranscript, 45000);
    }

    // 2. Fetch using provider service
    const service = new TranscriptService();
    const result = await service.fetchTranscript(videoId, targetLang);

    success = true;
    providerUsed = result.provider;
    rawTranscript = result.content;

    // 3. Save full transcript to cache
    await saveCachedTranscript(videoId, targetLang, result.content, result.segments);
    
    return downsampleText(rawTranscript, 45000);
  } catch (err) {
    if (err instanceof YoutubeImportError) {
      errorCode = err.code;
      throw new Error(`errors.youtube.${err.code.toLowerCase()}`);
    } else {
      errorCode = "UNKNOWN";
      console.error("extractYouTubeTranscript unknown error:", err);
      throw new Error("errors.youtube.provider_error");
    }
  } finally {
    const durationMs = Date.now() - startTime;
    if (userId) {
      logYoutubeImportAnalytics({
        videoId,
        userId,
        provider: providerUsed,
        attempts,
        success,
        durationMs,
        errorCode,
      }).catch((logErr) => console.error("[text-extractor] Failed logging analytics:", logErr));
    }
  }
}

/**
 * Extracts content from a URL or YouTube transcript in-memory.
 */
export async function extractTextFromUrl(
  url: string,
  languageCode?: string,
  userId?: string
): Promise<{ title: string; content: string }> {
  // 1. SSRF check
  const isSafe = await isSafeUrl(url);
  if (!isSafe) {
    throw new Error("Access to this URL is blocked for security reasons.");
  }

  if (isYouTubeUrl(url)) {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) {
      throw new Error("errors.youtube.invalid_url");
    }
    const transcript = await extractYouTubeTranscript(videoId, languageCode, userId);
    return {
      title: "YouTube Video",
      content: transcript,
    };
  }

  // Web page scraping
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(8000), // 8 seconds timeout
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.statusText}`);
  }

  let html = await response.text();
  // Truncate raw HTML to 500 KB limit if it's too large
  if (html.length > 512000) {
    html = html.slice(0, 512000);
  }

  const $ = cheerio.load(html);
  
  // Extract page title
  const title = $("title").text().trim() || "Web Page";

  // Remove styling, scripts, headers/footers to save tokens
  $("script, style, nav, footer, header, iframe, noscript, svg").remove();

  let bodyText = "";
  const mainContent = $("article, main, #content, .content, .main").first();
  if (mainContent.length > 0) {
    bodyText = mainContent.text();
  } else {
    bodyText = $("body").text();
  }

  // Clean spacing
  const cleanedContent = bodyText
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  return {
    title,
    content: cleanedContent.slice(0, 50000), // Max 50,000 characters
  };
}
