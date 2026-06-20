import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleAccessTokenForUser } from "@/lib/integrations/google";

export const dynamic = "force-dynamic";

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
    console.error("[Audio] Streaming auth failed: no user session");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Audio] Streaming request: fileId=", fileId, "userId=", user.id);

  try {
    const accessToken = await getGoogleAccessTokenForUser(user.id);
    const rangeHeader = request.headers.get("range");

    console.log("[Audio] Fetching from Drive: fileId=", fileId, "range=", rangeHeader ?? "(none)");

    const driveHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (rangeHeader) {
      driveHeaders["Range"] = rangeHeader;
    }

    const driveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: driveHeaders }
    );

    console.log("[Audio] Drive response status:", driveResponse.status, "for fileId:", fileId);

    if (!driveResponse.ok) {
      const errText = await driveResponse.text();
      console.error(`[Audio Error] Drive download failed for fileId ${fileId}: ${driveResponse.status}`, errText);

      if (driveResponse.status === 404) {
        return NextResponse.json({ error: "Audio file not found in Google Drive" }, { status: 404 });
      }
      if (driveResponse.status === 401 || driveResponse.status === 403) {
        return NextResponse.json({ error: "Google Drive access denied — reconnect your Drive" }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to download audio file" }, { status: driveResponse.status });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", driveResponse.headers.get("content-type") || "audio/mpeg");

    // Audio files are private and token-gated — never cache publicly or immutably.
    // The ?v= cache-buster in the URL handles client-side staleness.
    responseHeaders.set("Cache-Control", "private, no-store");

    // Always advertise range support so the HTML5 <audio> element can seek.
    responseHeaders.set("Accept-Ranges", "bytes");

    if (driveResponse.headers.has("content-length")) {
      responseHeaders.set("Content-Length", driveResponse.headers.get("content-length")!);
    }
    if (driveResponse.headers.has("content-range")) {
      responseHeaders.set("Content-Range", driveResponse.headers.get("content-range")!);
    }

    console.log("[Audio] Streaming response: status=", driveResponse.status, "content-type=", responseHeaders.get("Content-Type"));

    return new NextResponse(driveResponse.body, {
      status: driveResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[Audio Error] Streaming route exception:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
