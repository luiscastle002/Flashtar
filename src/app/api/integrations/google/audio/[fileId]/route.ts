import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAccessTokenForUser } from "@/lib/integrations/google";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accessToken = await getGoogleAccessTokenForUser(user.id);
    const rangeHeader = request.headers.get("range");

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    const driveResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers,
    });

    if (!driveResponse.ok) {
      console.error(`Google Drive download error for fileId ${fileId}:`, driveResponse.statusText);
      if (driveResponse.status === 404) {
        return NextResponse.json({ error: "Audio file not found in Google Drive" }, { status: 404 });
      }
      return NextResponse.json({ error: "Failed to download audio file" }, { status: driveResponse.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", driveResponse.headers.get("content-type") || "audio/mpeg");
    
    // Cache control is set to immutable because URLs will be versioned using the card's updated_at timestamp
    responseHeaders.set("Cache-Control", "public, max-age=31536000, immutable");

    if (driveResponse.headers.has("content-length")) {
      responseHeaders.set("Content-Length", driveResponse.headers.get("content-length")!);
    }
    if (driveResponse.headers.has("content-range")) {
      responseHeaders.set("Content-Range", driveResponse.headers.get("content-range")!);
    }
    if (driveResponse.headers.has("accept-ranges")) {
      responseHeaders.set("Accept-Ranges", driveResponse.headers.get("accept-ranges")!);
    }

    return new NextResponse(driveResponse.body, {
      status: driveResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("Audio streaming route error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
