import { createFileRoute } from "@tanstack/react-router";
import {
  FEED_ACCEPT,
  ProxyError,
  USER_AGENT,
  checkOrigin,
  decodeBody,
  errorResponse,
  jsonResponse,
  looksLikeFeed,
  preflight,
  readHead,
  safeFetch,
} from "@/lib/feedProxy";
import { requireAccess } from "@/lib/serverAccess";

// Common feed paths to probe when <link rel="alternate"> autodiscovery finds nothing
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

const HEAD_BYTES = 64 * 1024;
const TOTAL_BUDGET_MS = 25_000;

// Pull RSS/Atom URLs out of <link rel="alternate"> tags
function extractFeedLinksFromHtml(html: string, base: URL): string[] {
  const results: string[] = [];
  const tagRe = /<link([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[1];
    const type = /type=["']([^"']+)["']/i.exec(attrs)?.[1].toLowerCase();
    const rel = /rel=["']([^"']+)["']/i.exec(attrs)?.[1].toLowerCase();
    if (!type || rel !== "alternate") continue;
    if (!type.includes("rss") && !type.includes("atom") && !type.includes("xml")) continue;
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href, base);
      if (u.protocol === "http:" || u.protocol === "https:") results.push(u.toString());
    } catch {
      // skip malformed hrefs
    }
  }
  return results;
}

/** Fetch only the beginning of a URL; returns its decoded text, or null on any failure. */
async function fetchHead(url: string, accept: string, timeoutMs: number) {
  try {
    const { res, finalUrl } = await safeFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    const text = decodeBody(await readHead(res, HEAD_BYTES), contentType);
    return { text, contentType, finalUrl };
  } catch (e) {
    if (e instanceof ProxyError && e.status === 400) throw e; // blocked target: report it
    return null;
  }
}

// A candidate counts only if its body really is a feed (an XML sitemap on /feed is not).
async function probeFeedUrl(url: string): Promise<string | null> {
  const r = await fetchHead(url, FEED_ACCEPT, 8000);
  return r && looksLikeFeed(r.text) ? url : null;
}

export const Route = createFileRoute("/api/discover-feed")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      GET: async ({ request }) => {
        const blocked = checkOrigin(request);
        if (blocked) return blocked;
        const refused = await requireAccess(request);
        if (refused) return refused;
        try {
          const target = new URL(request.url).searchParams.get("url")?.trim();
          if (!target) throw new ProxyError("Missing url param");

          let parsed: URL;
          try {
            // Accept bare domains like "open.online"
            parsed = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
          } catch {
            throw new ProxyError("Invalid URL");
          }

          const deadline = Date.now() + TOTAL_BUDGET_MS;

          // One single fetch of the given URL: it is either the feed itself or a page.
          const first = await fetchHead(
            parsed.toString(),
            "text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,*/*",
            10000,
          );

          const discovered: string[] = [];
          if (first) {
            if (looksLikeFeed(first.text)) {
              return jsonResponse(request, {
                feeds: [{ url: first.finalUrl, title: null }],
              });
            }
            if (/html/i.test(first.contentType) || /<html|<head/i.test(first.text.slice(0, 2000))) {
              discovered.push(...extractFeedLinksFromHtml(first.text, new URL(first.finalUrl)));
            }
          }

          const origin = new URL(first?.finalUrl ?? parsed.toString()).origin;
          const toProbe = [...new Set([...discovered, ...FEED_PATHS.map((p) => `${origin}${p}`)])];

          // Probe with limited concurrency; stop at the first confirmed feed or when out of time
          const found: string[] = [];
          for (let i = 0; i < toProbe.length && Date.now() < deadline; i += 4) {
            const results = await Promise.all(toProbe.slice(i, i + 4).map(probeFeedUrl));
            found.push(...results.filter((r): r is string => !!r));
            if (found.length > 0) break;
          }

          if (found.length === 0) throw new ProxyError("No RSS/Atom feed found for this URL", 404);
          return jsonResponse(request, { feeds: found.map((url) => ({ url, title: null })) });
        } catch (e) {
          return errorResponse(request, e);
        }
      },
    },
  },
});
