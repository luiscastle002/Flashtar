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
 * GoogleCloudTtsProvider: Lightweight REST client for Google Cloud Text-to-Speech API.
 */
export class GoogleCloudTtsProvider implements TtsProvider {
  id = "google-cloud";

  async generateAudio(
    text: string,
    voiceId: string,
    language: string,
    options?: TtsOptions
  ): Promise<TtsResponse> {
    const env = getServerEnv();
    const apiKey = env.GOOGLE_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_CLOUD_API_KEY is not configured");
    }

    // Determine languageCode from voiceId (e.g. en-US-Neural2-F -> en-US)
    let languageCode = language;
    if (voiceId.includes("-")) {
      const parts = voiceId.split("-");
      if (parts.length >= 2) {
        languageCode = `${parts[0]}-${parts[1]}`;
      }
    }

    const inputPayload: Record<string, string> = {};
    if (options?.useSsml) {
      inputPayload.ssml = text.startsWith("<speak>") ? text : `<speak>${text}</speak>`;
    } else {
      inputPayload.text = text;
    }

    const audioEncoding = options?.audioFormat === "ogg" ? "OGG_OPUS" : "MP3";

    const body = {
      input: inputPayload,
      voice: {
        languageCode,
        name: voiceId,
      },
      audioConfig: {
        audioEncoding,
        speakingRate: options?.speed ?? 1.0,
        pitch: options?.pitch ?? 0.0,
        sampleRateHertz: options?.sampleRate ?? 24000,
      },
    };

    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error("Google Cloud TTS Error:", err);
      throw new Error(err.error?.message || "Google Cloud TTS synthesis failed.");
    }

    const data = await response.json();
    if (!data.audioContent) {
      throw new Error("No audioContent returned by Google Cloud TTS API");
    }

    const buffer = Buffer.from(data.audioContent, "base64");
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
  if (providerId === "google-cloud") {
    return new GoogleCloudTtsProvider();
  }
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
