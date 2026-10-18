import { createFileRoute } from "@tanstack/react-router";
import { normalizeLinks, parseFeed } from "@/lib/feedParse";
import {
  FEED_ACCEPT,
  MAX_FEED_BYTES,
  ProxyError,
  USER_AGENT,
  checkOrigin,
  decodeBody,
  errorResponse,
  jsonResponse,
  preflight,
  readCapped,
  safeFetch,
} from "@/lib/feedProxy";

export const Route = createFileRoute("/api/feed")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => preflight(request),
      GET: async ({ request }) => {
        const blocked = checkOrigin(request);
        if (blocked) return blocked;
        try {
          const target = new URL(request.url).searchParams.get("url");
          if (!target) throw new ProxyError("Missing url param");

          const { res, finalUrl } = await safeFetch(target, {
            headers: { "User-Agent": USER_AGENT, Accept: FEED_ACCEPT },
            signal: AbortSignal.timeout(15000),
          });
          // Keep the "Upstream <status>" format: the UI looks for it (e.g. 403 hint).
          if (!res.ok) {
            await res.body?.cancel().catch(() => {});
            throw new ProxyError(`Upstream ${res.status}`, 502);
          }

          const bytes = await readCapped(res, MAX_FEED_BYTES);
          const xml = decodeBody(bytes, res.headers.get("content-type") ?? "");
          let parsed;
          try {
            parsed = parseFeed(xml);
          } catch {
            throw new ProxyError("Unrecognized feed format", 502);
          }
          const feed = normalizeLinks(parsed, finalUrl);
          feed.items = feed.items.slice(0, 30);

          return jsonResponse(request, { ...feed, fetchedAt: new Date().toISOString() }, 200, {
            "Cache-Control": "public, max-age=300",
          });
        } catch (e) {
          return errorResponse(request, e);
        }
      },
    },
  },
});
