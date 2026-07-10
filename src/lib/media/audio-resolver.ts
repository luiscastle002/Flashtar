/**
 * Resolves the final playable URL for card audio files.
 * Handles CDN integration for relative course audios,
 * legacy local assets, and external absolute URLs.
 */
export function resolveAudioUrl(audioPath: string | null | undefined): string {
  if (!audioPath) {
    return "";
  }

  // 1. Absolute URLs (http:// or https://) -> return unchanged
  if (audioPath.startsWith("http://") || audioPath.startsWith("https://")) {
    return audioPath;
  }

  // 2. Relative Official Course Audio (starts with "audio/") -> resolve to CDN
  if (audioPath.startsWith("audio/")) {
    const baseUrl = process.env.NEXT_PUBLIC_COURSE_AUDIO_BASE_URL || "";
    // Handle trailing slashes in base URL safely
    const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    // Fallback in case NEXT_PUBLIC_COURSE_AUDIO_BASE_URL is not set: serve locally
    if (!cleanBaseUrl) {
      return `/${audioPath}`;
    }
    return `${cleanBaseUrl}/${audioPath}`;
  }

  // 3. Legacy Local Assets (/audio/courses/...) and Unknown Paths -> return unchanged
  return audioPath;
}
