import { NextRequest, NextResponse } from "next/server";

/** Hosts whose images we will proxy. Kept narrow because the proxy is only
 *  needed for canvas-export use cases where the upstream CDN refuses CORS.
 *  Adding a host here also exposes our server as an SSRF surface for it, so
 *  prefer specific image CDNs over generic web hosts. */
const ALLOWED_HOSTS = new Set([
  "pbs.twimg.com",
  "video.twimg.com",
  "abs.twimg.com",
  "ton.twitter.com",
]);

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "url parameter is required" },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json(
      { error: "only https urls are allowed" },
      { status: 400 },
    );
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json(
      { error: `host not allowed: ${parsed.hostname}` },
      { status: 403 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: { "User-Agent": "X-Read/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "fetch failed";
    return NextResponse.json(
      { error: `upstream fetch failed: ${message}` },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `upstream returned ${upstream.status}` },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: `upstream is not an image (content-type=${contentType})` },
      { status: 415 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
