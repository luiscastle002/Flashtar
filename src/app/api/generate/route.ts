import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateDeckFromText } from "@/lib/openai/generate-deck";
import { rateLimit } from "@/lib/rate-limit";
import { canGenerateDeck } from "@/lib/queries/user";
import { extractTextFromFile, extractTextFromUrl } from "@/lib/ingest/text-extractor";
import { generateCardAudioAction } from "@/actions/audio";

function logStep(stepNum: number, stepText: string, extra: Record<string, unknown> = {}) {
  const mem = process.memoryUsage();
  console.log(
    `[${stepNum}] ${stepText} | Time: ${Date.now()} | Perf: ${performance.now().toFixed(2)}ms | RSS: ${Math.round(
      mem.rss / 1024 / 1024
    )}MB | HeapUsed: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    extra
  );
}

const generateSchema = z.object({
  sourceType: z.enum(["prompt", "file", "url"]).default("prompt"),
  prompt: z.string().max(2000).optional(),
  url: z.string().url().max(2000).optional(),
  language: z.string().default("English"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  cardCount: z.number().int().min(0).max(50), // Cap at 50 max cards per request, 0 = Let AI Decide
  cardType: z.enum(["basic", "cloze", "mixed"]),
  customInstructions: z.string().max(2000).optional(),
  audioEnabled: z.boolean().default(false),
  audioVoice: z.string().optional(),
  audioPlacement: z.enum(["front", "back", "both"]).default("back"),
  audioProvider: z.string().optional(),
});

const ALLOWED_EXTENSIONS = ["pdf", "docx", "pptx", "xlsx", "txt", "png", "jpg", "jpeg", "webp"];

function getLanguageCode(language: string): string {
  const lang = language.toLowerCase();
  if (lang.includes("spanish") || lang === "es") return "es";
  if (lang.includes("portuguese") || lang === "pt") return "pt";
  if (lang.includes("japanese") || lang === "ja") return "ja";
  return "en";
}

export async function POST(request: Request) {
  logStep(1, "Request received", { contentType: request.headers.get("content-type") });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate Limiting: Max 5 generations per minute
  const limit = rateLimit(`generate:${user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!limit.success) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  let sourceType: "prompt" | "file" | "url" = "prompt";
  let prompt: string | undefined;
  let url: string | undefined;
  let files: File[] = [];
  let language = "English";
  let difficulty: "beginner" | "intermediate" | "advanced" = "intermediate";
  let cardCount = 20;
  let cardType: "basic" | "cloze" | "mixed" = "basic";
  let customInstructions: string | undefined;
  let audioEnabled = false;
  let audioVoice: string | undefined;
  let audioPlacement: "front" | "back" | "both" = "back";
  let audioProvider: string | undefined;

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      sourceType = (formData.get("sourceType") as "prompt" | "file" | "url") || "file";
      prompt = formData.get("prompt") as string || undefined;
      url = formData.get("url") as string || undefined;
      files = formData.getAll("files") as File[];
      language = formData.get("language") as string || "English";
      difficulty = (formData.get("difficulty") as "beginner" | "intermediate" | "advanced") || "intermediate";
      const rawCardCount = formData.get("cardCount") as string | null;
      cardCount = rawCardCount === "auto" ? 0 : parseInt(rawCardCount || "0", 10);
      cardType = (formData.get("cardType") as "basic" | "cloze" | "mixed") || "basic";
      customInstructions = formData.get("customInstructions") as string || undefined;
      audioEnabled = formData.get("audioEnabled") === "true";
      audioVoice = formData.get("audioVoice") as string || undefined;
      audioPlacement = (formData.get("audioPlacement") as "front" | "back" | "both") || "back";
      audioProvider = formData.get("audioProvider") as string || undefined;
    } else {
      const body = await request.json();
      const parsed = generateSchema.parse(body);
      sourceType = parsed.sourceType;
      prompt = parsed.prompt;
      url = parsed.url;
      language = parsed.language;
      difficulty = parsed.difficulty;
      cardCount = parsed.cardCount;
      cardType = parsed.cardType;
      customInstructions = parsed.customInstructions;
      audioEnabled = parsed.audioEnabled;
      audioVoice = parsed.audioVoice;
      audioPlacement = parsed.audioPlacement;
      audioProvider = parsed.audioProvider;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request payload format." }, { status: 400 });
  }

  logStep(2, "Request payload parsed", { sourceType, promptLength: prompt?.length, url, filesCount: files.length, hasInstructions: !!customInstructions });

  // Validate fields with Schema
  const validation = generateSchema.safeParse({
    sourceType,
    prompt,
    url,
    language,
    difficulty,
    cardCount,
    cardType,
    customInstructions,
    audioEnabled,
    audioVoice,
    audioPlacement,
    audioProvider,
  });

  if (!validation.success) {
    return NextResponse.json({ error: "Invalid request data. Please check parameters." }, { status: 400 });
  }

  logStep(3, "Inputs validated", { validation: validation.success });

  // Check Plan Entitlement
  const permission = await canGenerateDeck(cardCount);
  if (!permission.allowed) {
    return NextResponse.json({ error: permission.reason }, { status: 403 });
  }

  let sourceName = "";
  let sourceUrlForDb = "";
  let extractedContent = "";

  logStep(4, "Starting extraction");

  // Process depending on Ingestion Source
  if (sourceType === "prompt") {
    if (!prompt || prompt.length < 10) {
      return NextResponse.json({ error: "Please enter a prompt of at least 10 characters." }, { status: 400 });
    }
    extractedContent = prompt;
    sourceName = "Prompt Description";
  } else if (sourceType === "file") {
    if (files.length === 0) {
      return NextResponse.json({ error: "Please select at least one file to upload." }, { status: 400 });
    }
    if (files.length > 5) {
      return NextResponse.json({ error: "Maximum of 5 files can be uploaded per request." }, { status: 400 });
    }
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Maximum combined file upload size is 4MB." }, { status: 400 });
    }

    try {
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          return NextResponse.json({ error: "This file type is not supported." }, { status: 400 });
        }

        if (ext === "xlsx" && file.size > 1 * 1024 * 1024) {
          return NextResponse.json({ error: `Excel file "${file.name}" exceeds the 1MB size limit.` }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const text = await extractTextFromFile(file.name, file.type, buffer);
        extractedContent += `--- File: ${file.name} ---\n${text}\n\n`;
      }
      extractedContent = extractedContent.slice(0, 50000).trim();
      sourceName = files.map((f) => f.name).join(", ");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to extract text from files." },
        { status: 500 }
      );
    }
  } else if (sourceType === "url") {
    if (!url) {
      return NextResponse.json({ error: "Please enter a valid URL." }, { status: 400 });
    }
    try {
      const langCode = getLanguageCode(language);
      const scraped = await extractTextFromUrl(url, langCode, user.id);
      extractedContent = scraped.content;
      sourceName = scraped.title;
      sourceUrlForDb = url;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to fetch or parse web content." },
        { status: 500 }
      );
    }
  }

  if (!extractedContent) {
    return NextResponse.json({ error: "No text content could be extracted." }, { status: 400 });
  }

  logStep(5, "Extraction finished", { extractedLength: extractedContent.length });

  // Insert AI Generation Audit Entry
  const { data: generation, error: genError } = await supabase
    .from("ai_generations")
    .insert({
      user_id: user.id,
      prompt: prompt || url || sourceName,
      status: "processing",
      card_count: cardCount,
      source_type: sourceType,
      source_name: sourceName.slice(0, 500),
      source_url: sourceUrlForDb ? sourceUrlForDb.slice(0, 2000) : null,
    })
    .select()
    .single();

  if (genError || !generation) {
    console.error("AI_GENERATIONS_INSERT_ERROR:", genError);
    return NextResponse.json({ error: "Failed to initialize generation" }, { status: 500 });
  }

  try {
    logStep(8, "Starting OpenAI");
    const { deck, tokensUsed } = await generateDeckFromText(
      {
        sourceType,
        sourceName,
        sourceUrl: sourceUrlForDb || undefined,
        content: extractedContent,
      },
      {
        language,
        difficulty,
        cardCount,
        cardType,
        customInstructions,
      }
    );
    logStep(9, "OpenAI finished", { tokensUsed });
    logStep(10, "Saving deck", { deckName: deck.deckName, cardsCount: deck.cards.length });

    const { data: savedDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        name: deck.deckName,
        description: deck.description ?? null,
        language: language.slice(0, 10),
        card_type: cardType,
        difficulty,
      })
      .select()
      .single();

    if (deckError || !savedDeck) {
      throw new Error(deckError?.message ?? "Failed to save deck");
    }

    const flashcards = deck.cards.map((card, index) => ({
      deck_id: savedDeck.id,
      front: card.front,
      back: card.back,
      card_type: card.card_type ?? (cardType === "mixed" ? "basic" : cardType),
      position: index,
    }));

    const { data: insertedCards, error: cardsError } = await supabase
      .from("flashcards")
      .insert(flashcards)
      .select("id, front, back, position");

    if (cardsError || !insertedCards) throw new Error(cardsError?.message ?? "Failed to save flashcards");

    // 4. Generate TTS Audio if enabled
    let audioStatus: "none" | "success" | "partial_success" | "failed" = "none";
    let failedCount = 0;
    let successCount = 0;

    if (audioEnabled && insertedCards && insertedCards.length > 0) {
      logStep(11, "Triggering TTS generation for cards", { count: insertedCards.length });
      
      const audioTasks: Array<{ cardId: string; side: "front" | "back"; text: string }> = [];
      for (const card of insertedCards) {
        console.log("[Audio] API generated card:", card.id);
        const sides: Array<"front" | "back"> = [];
        if (audioPlacement === "front" || audioPlacement === "both") {
          sides.push("front");
        }
        if (audioPlacement === "back" || audioPlacement === "both") {
          sides.push("back");
        }
        
        for (const side of sides) {
          const textToSynthesize = side === "front" ? card.front : card.back;
          audioTasks.push({
            cardId: card.id,
            side,
            text: textToSynthesize,
          });
        }
      }

      // Process in batches of 5 to avoid overloading Google Drive and TTS APIs
      const concurrencyLimit = 5;
      for (let i = 0; i < audioTasks.length; i += concurrencyLimit) {
        const batch = audioTasks.slice(i, i + concurrencyLimit);
        const results = await Promise.all(
          batch.map(async (task) => {
            try {
              console.log("[Audio] Triggering audio generation for card:", task.cardId, "side:", task.side);
              const res = await generateCardAudioAction({
                flashcardId: task.cardId,
                side: task.side,
                text: task.text,
                providerId: audioProvider || "openai",
                voiceId: audioVoice || "alloy",
                language: language,
              });
              if ("error" in res && res.error) {
                console.error("[Audio Error] API audio generation failed for card:", task.cardId, "side:", task.side, "error:", res.error);
                return { success: false };
              }
              return { success: true };
            } catch (err) {
              console.error("[Audio Error] API audio generation exception for card:", task.cardId, "side:", task.side, "error:", err);
              return { success: false };
            }
          })
        );

        for (const res of results) {
          if (res.success) {
            successCount++;
          } else {
            failedCount++;
          }
        }
      }

      if (successCount > 0 && failedCount > 0) {
        audioStatus = "partial_success";
      } else if (successCount > 0 && failedCount === 0) {
        audioStatus = "success";
      } else if (successCount === 0 && failedCount > 0) {
        audioStatus = "failed";
      }

      logStep(12, "Audio generation complete", { successCount, failedCount, audioStatus });
    }

    const { error: updateError } = await supabase
      .from("ai_generations")
      .update({
        status: "completed",
        deck_id: savedDeck.id,
        tokens_used: tokensUsed,
        card_count: deck.cards.length,
      })
      .eq("id", generation.id);

    if (updateError) {
      console.error("AI_GENERATIONS_UPDATE_SUCCESS_ERROR:", {
        generationId: generation.id,
        deckId: savedDeck.id,
        error: updateError,
      });
    }

    logStep(13, "Returning response", { deckId: savedDeck.id, audioStatus });

    return NextResponse.json({
      deck: savedDeck,
      cardCount: deck.cards.length,
      generationId: generation.id,
      audioStatus,
      audioErrorsCount: failedCount,
    });
  } catch (error) {
    const { error: updateError } = await supabase
      .from("ai_generations")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Generation failed",
      })
      .eq("id", generation.id);

    if (updateError) {
      console.error("AI_GENERATIONS_UPDATE_FAILURE_ERROR:", {
        generationId: generation.id,
        error: updateError,
      });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}
