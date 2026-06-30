import * as cheerio from "cheerio";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * Extracts phonetic text by resolving ruby tags and stripping Anki cloze syntax.
 */
export function extractPhoneticText(html: string): string {
  if (!html) return "";

  // 1. Clean Anki Cloze syntax: {{c1::text}} or {{c1::text::hint}} -> text
  const cleaned = html.replace(/\{\{c\d+::(.*?)(?:::[^}]+)?\}\}/g, "$1");

  // 2. Parse ruby tags: <ruby>漢字<rt>かんじ</rt></ruby> -> かんじ
  if (cleaned.includes("<ruby") || cleaned.includes("<rt>")) {
    const $ = cheerio.load(cleaned);
    
    $("ruby").each((_, elem) => {
      const $ruby = $(elem);
      const rtTexts: string[] = [];
      $ruby.find("rt").each((_, rtElem) => {
        rtTexts.push($(rtElem).text());
      });
      // Replace the ruby element with its readings
      $ruby.replaceWith(rtTexts.join(""));
    });
    
    return $.text().trim();
  }

  // 3. Fallback to standard HTML stripping if no ruby tags
  return stripHtml(cleaned);
}

/**
 * Fetches the phonetic reading in Hiragana using GPT-4o-mini for Japanese Kanji.
 */
export async function getJapanesePhoneticReading(text: string): Promise<string> {
  const env = getServerEnv();
  if (!env.OPENAI_API_KEY) {
    console.warn("[TTS Preprocessor] OPENAI_API_KEY is not configured. Returning original text.");
    return text;
  }

  try {
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a Japanese linguist. Convert the input Japanese text into its exact phonetic reading in Hiragana. Keep non-Japanese text and punctuation as-is. Output ONLY the resulting Hiragana/phonetic string without any explanation or markdown formatting."
        },
        {
          role: "user",
          content: text
        }
      ],
      temperature: 0.0,
      max_tokens: 150,
    });

    const reading = response.choices[0]?.message?.content?.trim();
    if (reading) {
      return reading;
    }
  } catch (error) {
    console.error("[TTS Preprocessor] GPT-4o-mini reading conversion failed:", error);
  }

  return text;
}

/**
 * Preprocesses text before generating audio, resolving pronunciation and HTML.
 */
export async function preprocessTextForAudio(text: string, language: string): Promise<string> {
  // 1. Extract phonetic text from ruby/cloze markup and strip standard HTML
  let processed = extractPhoneticText(text);

  // 2. Language-specific phonetic conversion fallback for Japanese Kanji without ruby tags
  const isJapanese = language.toLowerCase() === "japanese" || language.toLowerCase() === "ja";
  const hasKanji = /[\u4e00-\u9faf]/.test(processed);
  const hasRubyTags = text.includes("<ruby") || text.includes("<rt>");

  if (isJapanese && hasKanji && !hasRubyTags) {
    console.log(`[TTS Preprocessor] Japanese Kanji detected without ruby tags in "${processed}". Fetching Hiragana reading...`);
    processed = await getJapanesePhoneticReading(processed);
  }

  return processed;
}
