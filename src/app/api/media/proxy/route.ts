import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate authentication (must be a signed-in user to prevent proxy abuse)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rangeHeader = request.headers.get("range");
    const headers: Record<string, string> = {
      "User-Agent": "FlashtarMediaProxy/1.0",
    };

    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const response = await fetch(targetUrl, { headers });

    if (!response.ok && response.status !== 206) {
      return NextResponse.json(
        { error: `Remote server responded with status ${response.status}` },
        { status: response.status }
      );
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    
    // Optimize performance: cache public media assets (since it is a public URL)
    responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    responseHeaders.set("Accept-Ranges", "bytes");

    if (response.headers.has("content-length")) {
      responseHeaders.set("Content-Length", response.headers.get("content-length")!);
    }
    if (response.headers.has("content-range")) {
      responseHeaders.set("Content-Range", response.headers.get("content-range")!);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[Media Proxy Error] Exception occurred:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
