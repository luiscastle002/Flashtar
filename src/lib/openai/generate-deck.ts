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
  card_type: z.enum(["basic", "cloze"]).optional(),
});

const generatedDeckSchema = z.object({
  deckName: z.string().min(1),
  description: z.string().optional(),
  cards: z.array(generatedCardSchema).min(1),
});

export interface GenerateDeckOptions {
  prompt: string;
  language: string;
  difficulty: Difficulty;
  cardCount: number;
  cardType: CardType;
}

function buildSystemPrompt(options: GenerateDeckOptions): string {
  const cardTypeInstructions: Record<CardType, string> = {
    basic: "Generate basic front/back flashcards. Each card must have a clear question on the front and a concise answer on the back.",
    cloze: "Generate cloze deletion flashcards. Put the full sentence on the front with {{c1::hidden text}} syntax for cloze deletions. The back should contain the full sentence with the answer revealed.",
    mixed: "Generate a mix of basic front/back and cloze deletion cards. Mark each card with card_type as 'basic' or 'cloze'.",
  };

  return `You are an expert educational content creator specializing in spaced repetition flashcards for Anki.

Generate exactly ${options.cardCount} high-quality flashcards based on the user's request.

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
}

export async function generateDeckWithAI(options: GenerateDeckOptions): Promise<{
  deck: GeneratedDeck;
  tokensUsed: number;
}> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: buildSystemPrompt(options) },
      { role: "user", content: options.prompt },
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
                required: ["front", "back"],
                additionalProperties: false,
              },
            },
          },
          required: ["deckName", "cards"],
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

export async function* streamDeckGeneration(
  options: GenerateDeckOptions
): AsyncGenerator<{ type: "progress" | "complete"; data?: GeneratedDeck; tokensUsed?: number }> {
  yield { type: "progress" };

  const result = await generateDeckWithAI(options);

  yield { type: "complete", data: result.deck, tokensUsed: result.tokensUsed };
}
