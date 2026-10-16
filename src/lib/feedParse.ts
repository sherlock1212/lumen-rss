import { XMLParser } from "fast-xml-parser";

/**
 * Pure feed parsing (RSS 2.0 / Atom / RSS 1.0). No network, no Worker APIs:
 * easy to unit-test. Network/security concerns live in feedProxy.ts.
 */

export interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  author?: string;
}
export interface FeedResult {
  title: string;
  link?: string;
  description?: string;
  items: FeedItem[];
}

// Named HTML entities that appear most often in feed content
const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'",
  nbsp: "\u00a0", ndash: "\u2013", mdash: "\u2014",
  lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201a",
  ldquo: "\u201c", rdquo: "\u201d", bdquo: "\u201e",
  laquo: "\u00ab", raquo: "\u00bb", hellip: "\u2026",
  copy: "\u00a9", reg: "\u00ae", trade: "\u2122",
  euro: "\u20ac", pound: "\u00a3", yen: "\u00a5",
};

function decodeEntities(s: string): string {
  return s
    // Numeric decimal: &#8217; &#039;
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    // Numeric hex: &#x2019;
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Named: &rsquo; &amp; etc.
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

function stripHtml(s: string, max = 220): string {
  if (!s) return "";
  const text = decodeEntities(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * fast-xml-parser returns an object ({ "#text": "...", "@_attr": "..." }) instead of
 * a string whenever an element carries attributes (e.g. <dc:creator xmlns:dc="...">).
 * Always funnel values through this before sending them to the client, otherwise
 * React crashes with error #31 ("Objects are not valid as a React child").
 */
function toText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return toText(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return toText(o["#text"]);
  }
  return "";
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
    return toText(l["@_href"]) || toText(l["#text"]);
  }
  return "";
}

export function parseFeed(xml: string): FeedResult {
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
      title: stripHtml(toText(it.title) || "Untitled", 200),
      link: pickLink(it.link),
      pubDate: toText(it.pubDate ?? it["dc:date"]) || undefined,
      description: stripHtml(toText(it.description ?? it["content:encoded"])),
      author: toText(it["dc:creator"] ?? it.author) || undefined,
    }));
    return {
      title: toText(ch.title) || "Untitled feed",
      link: pickLink(ch.link),
      description: stripHtml(toText(ch.description)),
      items,
    };
  }

  // Atom
  if (data.feed) {
    const f = data.feed;
    const items = asArray(f.entry).map((e: Record<string, unknown>) => {
      const authorNode = Array.isArray(e.author) ? e.author[0] : e.author;
      return {
        title: stripHtml(toText(e.title) || "Untitled", 200),
        link: pickLink(e.link),
        pubDate: toText(e.updated ?? e.published) || undefined,
        description: stripHtml(toText(e.summary ?? e.content)),
        author:
          toText((authorNode as Record<string, unknown> | undefined)?.name) || undefined,
      };
    });
    return {
      title: toText(f.title) || "Untitled feed",
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
      title: stripHtml(toText(it.title) || "Untitled", 200),
      link: pickLink(it.link),
      pubDate: toText(it["dc:date"]) || undefined,
      description: stripHtml(toText(it.description)),
      author: toText(it["dc:creator"]) || undefined,
    }));
    return {
      title: toText(ch.title) || "Untitled feed",
      link: pickLink(ch.link),
      description: stripHtml(toText(ch.description)),
      items,
    };
  }

  throw new Error("Unrecognized feed format");
}

/** Resolve a (possibly relative) link; only http(s) results are kept, anything else becomes "". */
export function resolveLink(link: string | undefined, base: string): string {
  const raw = (link ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Make every link in the feed absolute and safe. Relative links are resolved against
 * the channel link when it is itself an http(s) URL, otherwise against the feed URL.
 * Links with other schemes (javascript:, data:, mailto:...) are dropped.
 */
export function normalizeLinks(feed: FeedResult, feedUrl: string): FeedResult {
  const channel = resolveLink(feed.link, feedUrl);
  const base = channel || feedUrl;
  return {
    ...feed,
    link: channel || undefined,
    items: feed.items.map((it) => ({ ...it, link: resolveLink(it.link, base) })),
  };
}
