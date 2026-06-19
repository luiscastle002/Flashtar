export interface TranscriptSegment {
  text: string;
  duration: number; // in seconds
  offset: number; // in seconds
  lang: string;
}

export interface TranscriptResult {
  content: string;
  segments: TranscriptSegment[];
  languageCode: string;
  provider: string;
}

export interface ITranscriptProvider {
  name: string;
  fetch(videoId: string, targetLang?: string): Promise<TranscriptResult>;
}

// Custom error classes
export class YoutubeImportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "YoutubeImportError";
  }
}

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

const INNERTUBE_CLIENTS = [
  {
    name: "InnerTube-iOS",
    clientName: "IOS",
    clientVersion: "19.29.1",
    userAgent: "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iPhone OS 17_5_1 like Mac OS X; US; en)"
  },
  {
    name: "InnerTube-MWeb",
    clientName: "MWEB",
    clientVersion: "2.20240618.00.00",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
  },
  {
    name: "InnerTube-Android",
    clientName: "ANDROID",
    clientVersion: "19.25.39",
    userAgent: "com.google.android.youtube/19.25.39 (Linux; U; Android 14; US; en)"
  }
];

const USER_AGENT_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Parses XML transcript data into clean TimedText segment objects.
 */
export function parseTranscriptXml(xml: string, lang: string): TranscriptSegment[] {
  const results: TranscriptSegment[] = [];

  // 1. Try srv3 format first: <p t="ms" d="ms"><s>word</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match: RegExpExecArray | null;
  while ((match = pRegex.exec(xml)) !== null) {
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];
    let text = "";
    
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeHtmlEntities(text).trim();
    if (text) {
      results.push({
        text,
        duration: durMs / 1000,
        offset: startMs / 1000,
        lang,
      });
    }
  }

  if (results.length > 0) {
    return results;
  }

  // 2. Fall back to classic timedtext format: <text start="s" dur="s">content</text>
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;
  const classicResults = [...xml.matchAll(RE_XML_TRANSCRIPT)];
  return classicResults.map((result) => ({
    text: decodeHtmlEntities(result[3]),
    duration: parseFloat(result[2]),
    offset: parseFloat(result[1]),
    lang,
  }));
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export interface YoutubeCaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

export interface PlayerPlayabilityStatus {
  status?: string;
  reason?: string;
  errorScreen?: {
    playerErrorMessageRenderer?: {
      subreason?: {
        simpleText?: string;
      };
    };
  };
}

export interface PlayerResponse {
  playabilityStatus?: PlayerPlayabilityStatus;
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YoutubeCaptionTrack[];
    };
  };
}

/**
 * Structured diagnostic logger for YouTube pipeline telemetry.
 */
function logProviderDiagnostic(params: {
  videoId: string;
  provider: string;
  client?: string;
  playabilityStatus: PlayerPlayabilityStatus | null | undefined;
  httpStatus?: number;
  responseUrl?: string;
  durationMs: number;
}): void {
  const status = params.playabilityStatus?.status || "UNKNOWN";
  const reason = params.playabilityStatus?.reason || "";
  const subreason = params.playabilityStatus?.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText || "";
  
  const reasonLower = reason.toLowerCase();
  const subreasonLower = subreason.toLowerCase();
  const isCaptcha = reasonLower.includes("bot") || 
                    reasonLower.includes("captcha") || 
                    subreasonLower.includes("bot") || 
                    subreasonLower.includes("captcha") ||
                    reasonLower.includes("unusual traffic") ||
                    subreasonLower.includes("unusual traffic");

  console.log("[YouTube-Diagnostics]", JSON.stringify({
    videoId: params.videoId,
    provider: params.provider,
    client: params.client || "None",
    playabilityStatus: status,
    reason,
    subreason,
    isCaptcha,
    httpStatus: params.httpStatus || 200,
    responseUrl: params.responseUrl || "",
    durationMs: params.durationMs
  }, null, 2));
}

/**
 * Handles playabilityStatus error parsing following a strict classification decision tree.
 */
function checkPlayabilityError(playabilityStatus: PlayerPlayabilityStatus | null | undefined, videoId: string): void {
  if (!playabilityStatus) return;

  const status = playabilityStatus.status;
  if (status === "OK") return;

  const reason = (playabilityStatus.reason || "").toLowerCase();
  const description = (playabilityStatus.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText || "").toLowerCase();
  
  const isAgeRestricted = 
    reason.includes("age") || 
    description.includes("age") || 
    reason.includes("confirm your age") || 
    description.includes("confirm your age") ||
    reason.includes("inappropriate") ||
    description.includes("inappropriate");

  const isRegionRestricted = 
    reason.includes("region") || 
    description.includes("region") || 
    reason.includes("country") || 
    reason.includes("not available in your");

  const isPrivateOrDeleted = 
    reason.includes("private") || 
    description.includes("private") ||
    reason.includes("deleted") || 
    description.includes("deleted") ||
    reason.includes("removed") || 
    description.includes("removed") ||
    reason.includes("not exist") ||
    (reason.includes("unavailable") && (reason.includes("no longer") || reason.includes("removed")));

  const isMembersOnly = 
    reason.includes("members-only") || 
    description.includes("members-only") ||
    reason.includes("member-only") ||
    description.includes("member-only") ||
    reason.includes("join this channel") ||
    description.includes("join this channel");

  const isBotChallenge = 
    reason.includes("bot") || 
    description.includes("bot") ||
    reason.includes("captcha") ||
    description.includes("captcha") ||
    reason.includes("unusual traffic") ||
    description.includes("unusual traffic");

  if (status === "ERROR") {
    if (isPrivateOrDeleted) {
      throw new YoutubeImportError("VIDEO_NOT_FOUND", `Video is private or deleted (${videoId}).`);
    }
    throw new YoutubeImportError("VIDEO_NOT_FOUND", `Video unavailable: ${playabilityStatus.reason || status} (${videoId}).`);
  }

  if (status === "UNPLAYABLE") {
    if (isRegionRestricted) {
      throw new YoutubeImportError("REGION_RESTRICTED", `Video is region-restricted (${videoId}).`);
    }
    if (isPrivateOrDeleted) {
      throw new YoutubeImportError("VIDEO_NOT_FOUND", `Video is private or deleted (${videoId}).`);
    }
    if (isAgeRestricted) {
      throw new YoutubeImportError("AGE_RESTRICTED", `Video is age-restricted (${videoId}).`);
    }
    if (isMembersOnly) {
      throw new YoutubeImportError("LOGIN_REQUIRED_UNKNOWN", `Video is members-only (${videoId}).`);
    }
    throw new YoutubeImportError("VIDEO_NOT_FOUND", `Video is unplayable: ${playabilityStatus.reason || "unknown restriction"} (${videoId}).`);
  }

  if (status === "LOGIN_REQUIRED") {
    if (isAgeRestricted) {
      throw new YoutubeImportError("AGE_RESTRICTED", `Video is age-restricted (${videoId}).`);
    }
    if (isPrivateOrDeleted) {
      throw new YoutubeImportError("VIDEO_NOT_FOUND", `Video is private or deleted (${videoId}).`);
    }
    if (isMembersOnly) {
      throw new YoutubeImportError("LOGIN_REQUIRED_UNKNOWN", `Video is members-only (${videoId}).`);
    }
    if (isBotChallenge) {
      throw new YoutubeImportError("BOT_DETECTED", `Bot detection triggered LOGIN_REQUIRED (${videoId}).`);
    }
    // Generic fallback for LOGIN_REQUIRED when no explicit reason is matched
    throw new YoutubeImportError("LOGIN_REQUIRED_UNKNOWN", `Video requires sign-in: ${playabilityStatus.reason || "unknown reason"} (${videoId}).`);
  }
}

/**
 * Fetches the transcript content from a timedtext track URL.
 */
async function fetchTranscriptFromTrackUrl(trackUrl: string): Promise<string> {
  const url = new URL(trackUrl);
  if (!url.hostname.endsWith(".youtube.com")) {
    throw new YoutubeImportError("TRANSCRIPT_PROVIDER_ERROR", "Invalid caption track host.");
  }

  const response = await fetch(trackUrl, {
    headers: {
      "User-Agent": USER_AGENT_DESKTOP,
    },
    signal: AbortSignal.timeout(4000), // 4 seconds timeout
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new YoutubeImportError("YOUTUBE_RATE_LIMIT", "Rate limit hit while fetching timedtext.");
    }
    throw new YoutubeImportError("TRANSCRIPT_PROVIDER_ERROR", `Failed fetching timedtext: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Implementation of InnerTube transcript provider.
 */
export class InnerTubeProvider implements ITranscriptProvider {
  name = "InnerTube";

  async fetch(videoId: string, targetLang?: string): Promise<TranscriptResult> {
    let lastError: Error | null = null;

    // Loop through each client version context for maximum resilience
    for (const client of INNERTUBE_CLIENTS) {
      const clientStartTime = Date.now();
      try {
        console.log(`[InnerTubeProvider] Querying endpoint using client context: ${client.name}`);
        const response = await fetch(INNERTUBE_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": client.userAgent,
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: client.clientName,
                clientVersion: client.clientVersion,
              },
            },
            videoId,
          }),
          signal: AbortSignal.timeout(3000), // 3s per client attempt
        });

        const durationMs = Date.now() - clientStartTime;

        if (!response.ok) {
          logProviderDiagnostic({
            videoId,
            provider: "InnerTube",
            client: client.name,
            playabilityStatus: null,
            httpStatus: response.status,
            responseUrl: INNERTUBE_API_URL,
            durationMs,
          });

          if (response.status === 429) {
            throw new YoutubeImportError("YOUTUBE_RATE_LIMIT", "YouTube rate limit hit on InnerTube player request.");
          }
          continue;
        }

        const data = await response.json();
        const playabilityStatus = data?.playabilityStatus;
        
        logProviderDiagnostic({
          videoId,
          provider: "InnerTube",
          client: client.name,
          playabilityStatus,
          httpStatus: response.status,
          responseUrl: INNERTUBE_API_URL,
          durationMs,
        });

        // Parse playability restrictions
        checkPlayabilityError(playabilityStatus, videoId);

        const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
          continue; // No captions found under this client, try another client
        }

        const selection = selectCaptionTrack(captionTracks, targetLang);
        const xml = await fetchTranscriptFromTrackUrl(selection.track.baseUrl);
        const segments = parseTranscriptXml(xml, selection.languageCode);
        const content = segments.map((s) => s.text).join(" ");

        return {
          content,
          segments,
          languageCode: selection.languageCode,
          provider: `${client.name}${selection.isTranslated ? "-Translated" : ""}`,
        };
      } catch (err) {
        console.warn(`[InnerTubeProvider] Client ${client.name} failed:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof YoutubeImportError && err.code !== "TRANSCRIPT_PROVIDER_ERROR") {
          // If it is a known error like AGE_RESTRICTED or YOUTUBE_RATE_LIMIT, bubble up immediately
          throw err;
        }
      }
    }

    throw lastError || new YoutubeImportError("NO_CAPTIONS_AVAILABLE", "No captions resolved via InnerTube.");
  }
}

/**
 * Implementation of HTML Scraper transcript provider.
 */
export class HTMLScraperProvider implements ITranscriptProvider {
  name = "HTMLScraper";

  async fetch(videoId: string, targetLang?: string): Promise<TranscriptResult> {
    const startTime = Date.now();
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let logged = false;
    try {
      console.log(`[HTMLScraperProvider] Loading watch page for video: ${videoId}`);
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": USER_AGENT_DESKTOP,
          ...(targetLang && { "Accept-Language": targetLang }),
        },
        signal: AbortSignal.timeout(4000),
      });

      const durationMs = Date.now() - startTime;

      if (response.url && response.url.includes("consent.youtube.com")) {
        logged = true;
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Consent required" },
          httpStatus: response.status,
          responseUrl: response.url,
          durationMs,
        });
        throw new YoutubeImportError("CONSENT_REQUIRED", "Redirected to consent.youtube.com page.");
      }

      if (!response.ok) {
        logged = true;
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: null,
          httpStatus: response.status,
          responseUrl: response.url || targetUrl,
          durationMs,
        });
        if (response.status === 429) {
          throw new YoutubeImportError("YOUTUBE_RATE_LIMIT", "YouTube rate limit hit on page scraper request.");
        }
        throw new YoutubeImportError("TRANSCRIPT_PROVIDER_ERROR", `Failed fetching watch page: ${response.statusText}`);
      }

      const body = await response.text();

      // Check for rate limit / bot detection indicators in HTML
      if (
        body.includes('class="g-recaptcha"') || 
        body.includes('captcha-box') || 
        body.includes('/recaptcha/') ||
        body.includes("unusual traffic") ||
        body.includes("confirm you're not a bot")
      ) {
        logged = true;
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" },
          httpStatus: response.status,
          responseUrl: response.url || targetUrl,
          durationMs: Date.now() - startTime,
        });
        throw new YoutubeImportError("BOT_DETECTED", "reCAPTCHA prompt or bot challenge blocked the watch page scraping.");
      }

      // Check playability indicator
      if (!body.includes('"playabilityStatus":')) {
        logged = true;
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: null,
          httpStatus: response.status,
          responseUrl: response.url || targetUrl,
          durationMs: Date.now() - startTime,
        });
        throw new YoutubeImportError("VIDEO_NOT_FOUND", "Video playability status is missing.");
      }

      const playerResponse = parseInlinePlayerResponse(body);
      if (!playerResponse) {
        logged = true;
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: null,
          httpStatus: response.status,
          responseUrl: response.url || targetUrl,
          durationMs: Date.now() - startTime,
        });
        throw new YoutubeImportError("TRANSCRIPT_PROVIDER_ERROR", "Failed to parse inline player response.");
      }

      logged = true;
      logProviderDiagnostic({
        videoId,
        provider: "HTMLScraper",
        playabilityStatus: playerResponse.playabilityStatus,
        httpStatus: response.status,
        responseUrl: response.url || targetUrl,
        durationMs: Date.now() - startTime,
      });

      checkPlayabilityError(playerResponse?.playabilityStatus, videoId);

      const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
        throw new YoutubeImportError("NO_CAPTIONS_AVAILABLE", "Transcript is disabled or unavailable for this video.");
      }

      const selection = selectCaptionTrack(captionTracks, targetLang);
      const xml = await fetchTranscriptFromTrackUrl(selection.track.baseUrl);
      const segments = parseTranscriptXml(xml, selection.languageCode);
      const content = segments.map((s) => s.text).join(" ");

      return {
        content,
        segments,
        languageCode: selection.languageCode,
        provider: `HTMLScraper${selection.isTranslated ? "-Translated" : ""}`,
      };
    } catch (err) {
      if (!logged) {
        logProviderDiagnostic({
          videoId,
          provider: "HTMLScraper",
          playabilityStatus: null,
          httpStatus: 0,
          responseUrl: targetUrl,
          durationMs: Date.now() - startTime,
        });
      }
      if (err instanceof YoutubeImportError) throw err;
      throw new YoutubeImportError("TRANSCRIPT_PROVIDER_ERROR", err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Searches for ytInitialPlayerResponse inline JSON in the watch page body.
 */
function parseInlinePlayerResponse(html: string): PlayerResponse | null {
  const startTokens = [
    "var ytInitialPlayerResponse = ",
    "window['ytInitialPlayerResponse'] = ",
    "ytInitialPlayerResponse = "
  ];

  for (const token of startTokens) {
    const startIndex = html.indexOf(token);
    if (startIndex === -1) continue;

    const jsonStart = startIndex + token.length;
    let depth = 0;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(jsonStart, i + 1));
          } catch {
            break; // Try another token or fail
          }
        }
      }
    }
  }

  // Fallback: look for ytInitialPlayerResponse inside script block using regex
  const regex = /ytInitialPlayerResponse\s*=\s*({[\s\S]+?});/;
  const match = html.match(regex);
  if (match?.[1]) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }

  return null;
}

interface TrackSelection {
  track: YoutubeCaptionTrack;
  languageCode: string;
  isTranslated: boolean;
}

/**
 * Selection Chain logic:
 * 1. Target manual
 * 2. Target ASR (auto-generated)
 * 3. English manual
 * 4. English ASR
 * 5. Auto-translate from available manual/ASR track.
 */
function selectCaptionTrack(captionTracks: YoutubeCaptionTrack[], targetLang?: string): TrackSelection {
  const targetCode = targetLang ? targetLang.toLowerCase().split("-")[0] : "en";

  // Filter lists
  const targetManual = captionTracks.find((t) => t.languageCode?.startsWith(targetCode) && !t.kind);
  if (targetManual) return { track: targetManual, languageCode: targetManual.languageCode, isTranslated: false };

  const targetASR = captionTracks.find((t) => t.languageCode?.startsWith(targetCode) && t.kind === "asr");
  if (targetASR) return { track: targetASR, languageCode: targetASR.languageCode, isTranslated: false };

  // Fallback to English manual
  const enManual = captionTracks.find((t) => t.languageCode?.startsWith("en") && !t.kind);
  if (enManual) return { track: enManual, languageCode: enManual.languageCode, isTranslated: false };

  // Fallback to English ASR
  const enASR = captionTracks.find((t) => t.languageCode?.startsWith("en") && t.kind === "asr");
  if (enASR) return { track: enASR, languageCode: enASR.languageCode, isTranslated: false };

  // Select the absolute first available track (usually host language)
  const baseTrack = captionTracks[0];

  // Try auto-translating baseTrack to targetLang if targetLang is provided
  if (targetLang && baseTrack) {
    const translatedUrl = `${baseTrack.baseUrl}&tlang=${targetCode}`;
    return {
      track: { ...baseTrack, baseUrl: translatedUrl },
      languageCode: targetCode,
      isTranslated: true
    };
  }

  return { track: baseTrack, languageCode: baseTrack.languageCode, isTranslated: false };
}

/**
 * Orchestrator service running through the providers.
 */
export class TranscriptService {
  private providers: ITranscriptProvider[];

  constructor() {
    // Attempt InnerTube first (clean API, less bot-filtering), then Scraper
    this.providers = [
      new InnerTubeProvider(),
      new HTMLScraperProvider()
    ];
  }

  async fetchTranscript(videoId: string, targetLang?: string): Promise<TranscriptResult> {
    let lastError: Error | null = null;

    for (const provider of this.providers) {
      try {
        console.log(`[TranscriptService] Querying provider: ${provider.name}`);
        const result = await provider.fetch(videoId, targetLang);
        return result;
      } catch (err) {
        console.error(`[TranscriptService] Provider ${provider.name} failed:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
        
        // If the error indicates a fatal category that fallbacks won't solve (like age-restriction or region block),
        // raise immediately to invoke the appropriate error taxonomy.
        if (err instanceof YoutubeImportError && (err.code === "AGE_RESTRICTED" || err.code === "REGION_RESTRICTED" || err.code === "VIDEO_NOT_FOUND")) {
          throw err;
        }
      }
    }

    throw lastError || new YoutubeImportError("NO_CAPTIONS_AVAILABLE", "Could not retrieve transcript from any provider.");
  }
}
