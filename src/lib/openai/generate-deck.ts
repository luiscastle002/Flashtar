import OpenAI from "openai";
import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import type { CardType, Difficulty, GeneratedDeck } from "@/types";

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const env = getServerEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiInstance = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiInstance;
}

const generatedCardSchema = z.object({
  front: z.string().min(1),
  back: z.string(),
  card_type: z.enum(["basic", "cloze"]),
});

const generatedDeckSchema = z.object({
  deckName: z.string().min(1),
  description: z.string(),
  cards: z.array(generatedCardSchema).min(1),
});

export interface NormalizedSource {
  sourceType: "prompt" | "file" | "url";
  sourceName?: string;
  sourceUrl?: string;
  content: string;
}

export interface GenerateDeckOptions {
  prompt: string;
  language: string;
  difficulty: Difficulty;
  cardCount: number;
  cardType: CardType;
  customInstructions?: string;
}

function buildSystemPrompt(
  source: NormalizedSource,
  options: Omit<GenerateDeckOptions, "prompt">
): string {
  const cardTypeInstructions: Record<CardType, string> = {
    basic: "Generate basic front/back flashcards. Each card must have a clear question on the front and a concise answer on the back.",
    cloze: "Generate cloze deletion flashcards. Put the full sentence on the front with {{c1::hidden text}} syntax for cloze deletions. The back should contain the full sentence with the answer revealed.",
    mixed: "Generate a mix of basic front/back and cloze deletion cards. Mark each card with card_type as 'basic' or 'cloze'.",
  };

  let sourceContext = "";
  if (source.sourceType === "prompt") {
    sourceContext = "Generate flashcards based on the user's prompt request.";
  } else if (source.sourceType === "file") {
    sourceContext = `Generate flashcards directly from the provided source document text (File Name: ${source.sourceName || 'unnamed'}). Focus on extracting the most important educational concepts from the text.`;
  } else if (source.sourceType === "url") {
    sourceContext = `Generate flashcards directly from the provided website/web page content (URL: ${source.sourceUrl || 'unknown'}, Title: ${source.sourceName || 'web page'}). Focus on extracting the most important educational concepts from the text.`;
  }

  let systemPrompt = `You are an expert educational content creator specializing in spaced repetition flashcards for Anki.

${sourceContext}

${options.cardCount === 0 ? "Generate a suitable number of high-quality flashcards based on the depth of the content, typically between 10 and 25 cards (do not exceed 35 cards)." : `Generate exactly ${options.cardCount} high-quality flashcards.`}

Language: ${options.language}
Difficulty: ${options.difficulty}
Card format: ${cardTypeInstructions[options.cardType]}

Rules:
- Cards must be accurate, educational, and appropriate for the difficulty level
- Avoid duplicate or overly similar cards
- Keep answers concise but complete
- For cloze cards, use Anki syntax: {{c1::answer}} for single cloze
- Return valid JSON matching the schema exactly
- deckName should be descriptive and concise`;

  if (options.customInstructions) {
    systemPrompt += `\n\nUser Custom Instructions:\n${options.customInstructions}`;
  }

  const isJapanese = options.language.toLowerCase() === "japanese" || options.language.toLowerCase() === "ja";
  if (isJapanese) {
    systemPrompt += `\n\nJapanese Language Formatting Rules:
- All Japanese Kanji characters on the front and back of cards (including inside cloze deletions) MUST be wrapped in HTML ruby tags for furigana (pronunciation readings in Hiragana).
- Example: Use '<ruby>漢字<rt>かんじ</rt></ruby>' instead of just '漢字'.
- For compound words or sentences, wrap each Kanji or Kanji compound with its reading.
- Ensure punctuation and particles remain outside ruby tags.`;
  }

  return systemPrompt;
}

export async function generateDeckFromText(
  source: NormalizedSource,
  options: Omit<GenerateDeckOptions, "prompt">
): Promise<{
  deck: GeneratedDeck;
  tokensUsed: number;
}> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildSystemPrompt(source, options) },
      { role: "user", content: source.content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "flashcard_deck",
        strict: true,
        schema: {
          type: "object",
          properties: {
            deckName: { type: "string" },
            description: { type: "string" },
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  front: { type: "string" },
                  back: { type: "string" },
                  card_type: { type: "string", enum: ["basic", "cloze"] },
                },
                required: ["front", "back", "card_type"],
                additionalProperties: false,
              },
            },
          },
          required: ["deckName", "description", "cards"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = generatedDeckSchema.parse(JSON.parse(content));
  const tokensUsed = response.usage?.total_tokens ?? 0;

  return { deck: parsed, tokensUsed };
}

export async function generateDeckWithAI(options: GenerateDeckOptions): Promise<{
  deck: GeneratedDeck;
  tokensUsed: number;
}> {
  return generateDeckFromText(
    {
      sourceType: "prompt",
      content: options.prompt,
    },
    options
  );
}

export async function* streamDeckGeneration(
  options: GenerateDeckOptions
): AsyncGenerator<{ type: "progress" | "complete"; data?: GeneratedDeck; tokensUsed?: number }> {
  yield { type: "progress" };

  const result = await generateDeckWithAI(options);

  yield { type: "complete", data: result.deck, tokensUsed: result.tokensUsed };
}
