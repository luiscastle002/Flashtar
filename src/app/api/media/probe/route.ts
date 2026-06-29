import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate user authentication (SaaS security standard)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const urlObj = new URL(targetUrl);
    const hostname = urlObj.hostname.toLowerCase();
    
    // Quick domain matching for common embedded media
    if (
      hostname.includes("youtube.com") ||
      hostname.includes("youtu.be") ||
      hostname.includes("vimeo.com")
    ) {
      return NextResponse.json({
        url: targetUrl,
        detectedType: "embed",
        mimeType: "text/html",
        sizeBytes: null,
      });
    }

    let response: Response;
    try {
      // 1. Try a lightweight HEAD request first
      response = await fetch(targetUrl, {
        method: "HEAD",
        headers: {
          "User-Agent": "FlashtarMediaProbe/1.0",
        },
      });
      
      // If HEAD is rejected (e.g., 405 Method Not Allowed), fall back to GET (first byte only)
      if (!response.ok || response.status === 405) {
        response = await fetch(targetUrl, {
          method: "GET",
          headers: {
            "User-Agent": "FlashtarMediaProbe/1.0",
            Range: "bytes=0-0", // Fetch only the first byte to conserve bandwidth
          },
        });
      }
    } catch {
      // Fallback GET request if HEAD completely throws an exception
      response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "User-Agent": "FlashtarMediaProbe/1.0",
          Range: "bytes=0-0",
        },
      });
    }

    if (!response.ok && response.status !== 206) {
      return NextResponse.json({
        url: targetUrl,
        detectedType: "link",
        mimeType: "text/html",
        sizeBytes: null,
      });
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const sizeHeader = response.headers.get("content-length");
    const sizeBytes = sizeHeader ? parseInt(sizeHeader, 10) : null;

    let detectedType: "image" | "audio" | "video" | "embed" | "link" = "link";

    if (contentType.startsWith("image/")) {
      detectedType = "image";
    } else if (contentType.startsWith("audio/")) {
      detectedType = "audio";
    } else if (contentType.startsWith("video/")) {
      detectedType = "video";
    } else if (contentType.includes("html") || contentType.includes("xhtml")) {
      detectedType = "embed";
    }

    return NextResponse.json({
      url: targetUrl,
      detectedType,
      mimeType: contentType,
      sizeBytes,
    });
  } catch (err) {
    console.error("[Media Probe Error] Exception occurred:", err);
    // Graceful fallback to a generic link type rather than throwing 500
    return NextResponse.json({
      url: targetUrl,
      detectedType: "link",
      mimeType: "application/octet-stream",
      sizeBytes: null,
    });
  }
}
