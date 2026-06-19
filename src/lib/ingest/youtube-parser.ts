/**
 * Checks if a given string is a valid YouTube URL.
 */
export function isYouTubeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^(www\.|m\.|nocookie\.)/, "");
    return hostname === "youtube.com" || hostname === "youtube-nocookie.com" || hostname === "youtu.be";
  } catch {
    return false;
  }
}

/**
 * Extracts the 11-character video ID from any YouTube URL format.
 * Returns null if the URL is invalid or the video ID cannot be parsed.
 */
export function getYouTubeVideoId(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.replace(/^(www\.|m\.|nocookie\.)/, "");

    let videoId: string | null = null;

    if (hostname === "youtu.be") {
      // Format: https://youtu.be/VIDEO_ID?params
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0]) {
        // Strip any trailing slash or params that split(/) might have included
        videoId = parts[0].split(/[?#&]/)[0];
      }
    } else if (hostname === "youtube.com" || hostname === "youtube-nocookie.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      
      // Paths: /shorts/VIDEO_ID, /embed/VIDEO_ID, /v/VIDEO_ID, /vi/VIDEO_ID
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "v" || parts[0] === "vi") {
        if (parts[1]) {
          videoId = parts[1].split(/[?#&]/)[0];
        }
      } else {
        // Formats: /watch?v=VIDEO_ID or similar query params
        videoId = url.searchParams.get("v") || url.searchParams.get("vi");
      }
    }

    // A YouTube video ID must be exactly 11 characters long
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return videoId;
    }

    return null;
  } catch {
    return null;
  }
}
