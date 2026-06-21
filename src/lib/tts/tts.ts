import crypto from "crypto";
import OpenAI from "openai";
import { getServerEnv } from "@/lib/env";

export interface TtsOptions {
  speed?: number;
  pitch?: number;
  useSsml?: boolean;
  audioFormat?: "mp3" | "wav" | "ogg";
  sampleRate?: number;
}

export interface TtsResponse {
  audioBuffer: Buffer;
  format: "mp3" | "wav" | "ogg";
  charactersCount: number;
}

export interface TtsProvider {
  id: string;
  generateAudio(
    text: string,
    voiceId: string,
    language: string,
    options?: TtsOptions
  ): Promise<TtsResponse>;
}

/**
 * OpenAiTtsProvider: Synthesizes speech using OpenAI's tts-1 model.
 */
export class OpenAiTtsProvider implements TtsProvider {
  id = "openai";
  private openaiInstance: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openaiInstance) {
      const env = getServerEnv();
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is not configured");
      }
      this.openaiInstance = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
    return this.openaiInstance;
  }

  async generateAudio(
    text: string,
    voiceId: string,
    language: string,
    options?: TtsOptions
  ): Promise<TtsResponse> {
    const openai = this.getOpenAI();
    
    // map common voices or default to alloy
    let voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy";
    const possibleVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    if (possibleVoices.includes(voiceId.toLowerCase())) {
      voice = voiceId.toLowerCase() as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
    }

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      response_format: options?.audioFormat === "ogg" ? "opus" : "mp3",
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      audioBuffer: buffer,
      format: options?.audioFormat || "mp3",
      charactersCount: text.length,
    };
  }
}

/**
 * Factory getter for TTS Providers.
 */
export function getTtsProvider(providerId: string): TtsProvider {
  void providerId;
  return new OpenAiTtsProvider();
}

/**
 * Generates a unique, deterministic audio hash for synthesis settings caching.
 */
export function generateAudioHash(
  text: string,
  providerId: string,
  voiceId: string,
  language: string,
  options?: TtsOptions
): string {
  const payload = {
    text: text.trim().toLowerCase(),
    provider: providerId,
    voice: voiceId,
    language: language.toLowerCase(),
    speed: options?.speed ?? 1.0,
    pitch: options?.pitch ?? 0.0,
    ssml_settings: options?.useSsml ?? false,
    audio_format: options?.audioFormat ?? "mp3",
    sample_rate: options?.sampleRate ?? 24000,
  };
  
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}
