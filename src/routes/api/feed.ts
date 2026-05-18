import { createFileRoute } from "@tanstack/react-router";
import { XMLParser } from "fast-xml-parser";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  author?: string;
}
interface FeedResult {
  title: string;
  link?: string;
  description?: string;
  items: FeedItem[];
}

function stripHtml(s: string, max = 220): string {
  if (!s) return "";
  const text = String(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function pickLink(link: unknown): string {
  if (!link) return "";
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => l?.["@_rel"] === "alternate") ?? link[0];
    return pickLink(alt);
  }
  if (typeof link === "object" && link) {
    const l = link as Record<string, unknown>;
    return (l["@_href"] as string) ?? (l["#text"] as string) ?? "";
  }
  return "";
}

function parseFeed(xml: string): FeedResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: true,
  });
  const data = parser.parse(xml);

  // RSS 2.0
  if (data.rss?.channel) {
    const ch = data.rss.channel;
    const items = asArray(ch.item).map((it: Record<string, unknown>) => ({
      title: stripHtml(String(it.title ?? "Untitled"), 200),
      link: typeof it.link === "string" ? it.link : pickLink(it.link),
      pubDate: (it.pubDate ?? it["dc:date"]) as string | undefined,
      description: stripHtml(String(it.description ?? it["content:encoded"] ?? "")),
      author: (it["dc:creator"] ?? it.author) as string | undefined,
    }));
    return {
      title: String(ch.title ?? "Untitled feed"),
      link: pickLink(ch.link),
      description: stripHtml(String(ch.description ?? "")),
      items,
    };
  }

  // Atom
  if (data.feed) {
    const f = data.feed;
    const items = asArray(f.entry).map((e: Record<string, unknown>) => {
      const content = (e.summary ?? e.content ?? "") as unknown;
      const text =
        typeof content === "string"
          ? content
          : (content as Record<string, unknown>)?.["#text"];
      return {
        title: stripHtml(
          typeof e.title === "string"
            ? e.title
            : String((e.title as Record<string, unknown>)?.["#text"] ?? "Untitled"),
          200,
        ),
        link: pickLink(e.link),
        pubDate: (e.updated ?? e.published) as string | undefined,
        description: stripHtml(String(text ?? "")),
        author:
          ((e.author as Record<string, unknown>)?.name as string | undefined) ??
          undefined,
      };
    });
    return {
      title: String(
        typeof f.title === "string"
          ? f.title
          : (f.title as Record<string, unknown>)?.["#text"] ?? "Untitled feed",
      ),
      link: pickLink(f.link),
      description: "",
      items,
    };
  }

  // RDF / RSS 1.0
  if (data["rdf:RDF"]) {
    const r = data["rdf:RDF"];
    const ch = r.channel ?? {};
    const items = asArray(r.item).map((it: Record<string, unknown>) => ({
      title: stripHtml(String(it.title ?? "Untitled"), 200),
      link: typeof it.link === "string" ? it.link : pickLink(it.link),
      pubDate: it["dc:date"] as string | undefined,
      description: stripHtml(String(it.description ?? "")),
    }));
    return {
      title: String(ch.title ?? "Untitled feed"),
      link: pickLink(ch.link),
      description: stripHtml(String(ch.description ?? "")),
      items,
    };
  }

  throw new Error("Unrecognized feed format");
}

export const Route = createFileRoute("/api/feed")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const target = url.searchParams.get("url");
          if (!target) {
            return new Response(JSON.stringify({ error: "Missing url param" }), {
              status: 400,
              headers: CORS,
            });
          }
          let parsed: URL;
          try {
            parsed = new URL(target);
          } catch {
            return new Response(JSON.stringify({ error: "Invalid url" }), {
              status: 400,
              headers: CORS,
            });
          }
          if (!["http:", "https:"].includes(parsed.protocol)) {
            return new Response(JSON.stringify({ error: "Invalid protocol" }), {
              status: 400,
              headers: CORS,
            });
          }

          const upstream = await fetch(parsed.toString(), {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (compatible; LovableRSSReader/1.0; +https://lovable.dev)",
              Accept:
                "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
            },
            signal: AbortSignal.timeout(15000),
          });

          if (!upstream.ok) {
            return new Response(
              JSON.stringify({ error: `Upstream ${upstream.status}` }),
              { status: 502, headers: CORS },
            );
          }
          const xml = await upstream.text();
          const feed = parseFeed(xml);
          // limit items
          feed.items = feed.items.slice(0, 30);
          return new Response(
            JSON.stringify({ ...feed, fetchedAt: new Date().toISOString() }),
            {
              status: 200,
              headers: {
                ...CORS,
                "Cache-Control": "public, max-age=300",
              },
            },
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
