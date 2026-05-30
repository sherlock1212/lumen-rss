import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const UA =
  "Mozilla/5.0 (compatible; LumenRSS/1.0; +https://lumen-rss.sheldon88.workers.dev)";

// Common feed path suffixes to probe if <link> autodiscovery fails
const FEED_PATHS = [
  "/feed",
  "/feed/",
  "/rss",
  "/rss.xml",
  "/feed.xml",
  "/atom.xml",
  "/index.xml",
  "/?feed=rss2",
  "/?feed=rss",
  "/?feed=atom",
  "/feeds/posts/default", // Blogger
];

// Sniff whether a Content-Type header looks like an XML feed
function isFeedContentType(ct: string): boolean {
  return /application\/(rss|atom|xml|rdf)|text\/xml/i.test(ct);
}

// Try to pull the RSS/Atom URL from the <link rel="alternate"> tags in HTML
function extractFeedLinksFromHtml(html: string, base: URL): string[] {
  const results: string[] = [];
  // Match <link ... > tags (self-closing or not)
  const tagRe = /<link([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[1];
    const typeMatch = /type=["']([^"']+)["']/i.exec(attrs);
    const relMatch = /rel=["']([^"']+)["']/i.exec(attrs);
    if (!typeMatch || !relMatch) continue;
    const type = typeMatch[1].toLowerCase();
    const rel = relMatch[1].toLowerCase();
    if (rel !== "alternate") continue;
    if (
      !type.includes("rss") &&
      !type.includes("atom") &&
      !type.includes("xml")
    )
      continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(attrs);
    if (!hrefMatch) continue;
    try {
      results.push(new URL(hrefMatch[1], base).toString());
    } catch {
      // skip malformed hrefs
    }
  }
  return results;
}

// Quick-check: does this URL actually return feed XML?
async function probeFeedUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (isFeedContentType(ct)) return url;
    // Content-Type not conclusive — peek at the body
    const chunk = await res.text();
    const trimmed = chunk.trimStart().slice(0, 400);
    if (
      trimmed.includes("<rss") ||
      trimmed.includes("<feed") ||
      trimmed.includes("<rdf:RDF")
    )
      return url;
    return null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/discover-feed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const reqUrl = new URL(request.url);
          const target = reqUrl.searchParams.get("url");
          if (!target) {
            return new Response(JSON.stringify({ error: "Missing url param" }), {
              status: 400,
              headers: CORS,
            });
          }

          let parsed: URL;
          try {
            // Accept bare domains like "open.online" by prepending https://
            const withScheme =
              target.startsWith("http://") || target.startsWith("https://")
                ? target
                : `https://${target}`;
            parsed = new URL(withScheme);
          } catch {
            return new Response(JSON.stringify({ error: "Invalid URL" }), {
              status: 400,
              headers: CORS,
            });
          }

          // ── Step 1: maybe the user already gave us a direct feed URL ──────
          const directHit = await probeFeedUrl(parsed.toString());
          if (directHit) {
            return new Response(
              JSON.stringify({ feeds: [{ url: directHit, title: null }] }),
              { status: 200, headers: CORS },
            );
          }

          // ── Step 2: fetch the homepage and parse <link rel="alternate"> ───
          const homeRes = await fetch(parsed.toString(), {
            headers: {
              "User-Agent": UA,
              Accept: "text/html,application/xhtml+xml,*/*",
            },
            signal: AbortSignal.timeout(10000),
          });

          const discovered: string[] = [];

          if (homeRes.ok) {
            const ct = homeRes.headers.get("content-type") ?? "";
            // If the homepage itself IS a feed (redirect to feed URL, etc.)
            if (isFeedContentType(ct)) {
              const chunk = await homeRes.text();
              const trimmed = chunk.trimStart().slice(0, 400);
              if (
                trimmed.includes("<rss") ||
                trimmed.includes("<feed") ||
                trimmed.includes("<rdf:RDF")
              ) {
                return new Response(
                  JSON.stringify({
                    feeds: [{ url: parsed.toString(), title: null }],
                  }),
                  { status: 200, headers: CORS },
                );
              }
            }

            if (ct.includes("html")) {
              // Only read the <head> section (first 20 KB is plenty)
              const html = await homeRes.text();
              const head = html.slice(0, 20_000);
              discovered.push(...extractFeedLinksFromHtml(head, parsed));
            }
          }

          // ── Step 3: probe common feed paths in parallel ───────────────────
          const origin = parsed.origin; // e.g. https://www.open.online
          const commonCandidates = FEED_PATHS.map(
            (p) => `${origin}${p}`,
          );

          // Only probe paths we haven't already discovered via <link> tags
          const toProbe = [
            ...discovered,
            ...commonCandidates.filter((u) => !discovered.includes(u)),
          ];

          // Run probes with controlled concurrency (4 at a time)
          const found: string[] = [];
          for (let i = 0; i < toProbe.length; i += 4) {
            const batch = toProbe.slice(i, i + 4);
            const results = await Promise.all(batch.map(probeFeedUrl));
            for (const r of results) {
              if (r) found.push(r);
            }
            // Stop as soon as we have at least one confirmed feed
            if (found.length > 0) break;
          }

          if (found.length === 0) {
            return new Response(
              JSON.stringify({ error: "No RSS/Atom feed found for this URL" }),
              { status: 404, headers: CORS },
            );
          }

          return new Response(
            JSON.stringify({
              feeds: found.map((url) => ({ url, title: null })),
            }),
            { status: 200, headers: CORS },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: CORS,
          });
        }
      },
    },
  },
});
