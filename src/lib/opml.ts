// Import / export of dashboards as OPML.
//
// Import accepts:
//   - Lumen's own OPML export (tabs, feeds, custom titles, bookmark tiles, columns)
//   - uStart.org XML export:
//       <opml><body><outline title="Tab"><outline type="rss"
//       xmlUrl="..." prefs="{'URL':&quot;...&quot;,'_t':&quot;Custom Title&quot;}"
//       pos="{'col':0,'row':1}" /></outline>...</body></opml>
//   - standard OPML from other readers (title/text + xmlUrl)
//
// Export writes standard OPML 2.0 plus a few optional `lumen*` attributes
// (ignored by other readers) so that Lumen can restore its own files faithfully.

import { XMLParser } from "fast-xml-parser";
import type { Bookmark, DashboardState, DashboardTab, FeedWidget } from "./rss";
import { uid } from "./utils";

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;

// ── Import ───────────────────────────────────────────────────────────────────

// uStart stores JSON-ish blobs with SINGLE quotes and HTML-entity-escaped
// double quotes. Convert to valid JSON before parsing. Best-effort.
function parsePseudoJson(s: string | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const unescaped = s
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    // Replace single-quoted keys/values with double-quoted ones, but only
    // when they don't already contain double quotes (those were &quot;).
    const jsonish = unescaped.replace(/'([^']*?)'/g, (_m, inner) => {
      return `"${inner.replace(/"/g, '\\"')}"`;
    });
    return JSON.parse(jsonish);
  } catch {
    return {};
  }
}

type RawOutline = {
  "@_title"?: string;
  "@_text"?: string;
  "@_type"?: string;
  "@_xmlUrl"?: string;
  "@_url"?: string;
  "@_prefs"?: string;
  "@_pos"?: string;
  "@_lumenTitle"?: string;
  "@_lumenColumns"?: string;
  outline?: RawOutline | RawOutline[];
};

export interface ImportResult {
  tabs: DashboardTab[];
  feedCount: number;
  bookmarkCount: number;
  skipped: number;
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null || (v as unknown) === "") return [];
  return Array.isArray(v) ? v : [v];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isHttpUrl(s: string): boolean {
  try {
    const p = new URL(s).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

function parseBookmarks(node: RawOutline): Bookmark[] {
  const out: Bookmark[] = [];
  for (const b of toArray<RawOutline>(node.outline)) {
    const url = asString(b["@_url"] ?? b["@_xmlUrl"]).trim();
    if (!isHttpUrl(url)) continue;
    const title = (asString(b["@_text"]) || asString(b["@_title"])).trim() || url;
    out.push({ id: uid(), url, title });
  }
  return out;
}

export function parseOpml(xml: string): ImportResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
  });
  const doc = parser.parse(xml);
  const body = doc?.opml?.body;
  if (!body) throw new Error("Not a valid OPML file (missing <body>).");

  const rootChildren = toArray<RawOutline>(body.outline);
  const tabs: DashboardTab[] = [];
  let feedCount = 0;
  let bookmarkCount = 0;
  let skipped = 0;

  // If the file has no top-level group outlines (just flat feeds), wrap them
  // all in a single "Imported" tab.
  const hasTabs = rootChildren.some(
    (o) => !o["@_xmlUrl"] && (o["@_title"] || o["@_text"]),
  );
  const tabSources = hasTabs
    ? rootChildren.filter((o) => !o["@_xmlUrl"])
    : [{ "@_title": "Imported", outline: rootChildren } as RawOutline];

  for (const tabNode of tabSources) {
    const name =
      (tabNode["@_title"] || tabNode["@_text"] || "Imported").trim() ||
      "Imported";

    const items = toArray<RawOutline>(tabNode.outline);
    const feeds = items.filter(
      (o) => (o["@_type"] === "rss" || o["@_xmlUrl"]) && o["@_xmlUrl"],
    );
    const favTiles = items.filter(
      (o) => o["@_type"] === "favourites" && !o["@_xmlUrl"],
    );

    if (feeds.length === 0 && favTiles.length === 0) continue;

    // Column layout: explicit `lumenColumns` if present, otherwise inferred
    // from the highest column used (clamped to MIN..MAX).
    let maxCol = 0;
    const positioned = [...feeds, ...favTiles].map((node, order) => {
      const pos = parsePseudoJson(node["@_pos"]);
      const col =
        typeof pos.col === "number" && pos.col >= 0 ? Math.floor(pos.col) : 0;
      const row = typeof pos.row === "number" ? pos.row : 0;
      if (col > maxCol) maxCol = col;
      return { node, col, row, order };
    });
    const declared = Number.parseInt(asString(tabNode["@_lumenColumns"]), 10);
    const columns = Math.max(
      MIN_COLUMNS,
      Math.min(
        MAX_COLUMNS,
        Number.isFinite(declared) ? declared : maxCol + 1,
      ),
    );

    // Sort by column, then row; `order` keeps document order for ties.
    positioned.sort((a, b) => a.col - b.col || a.row - b.row || a.order - b.order);

    const widgets: FeedWidget[] = [];
    for (const { node, col } of positioned) {
      const column = Math.min(col, columns - 1);

      if (node["@_type"] === "favourites") {
        const bookmarks = parseBookmarks(node);
        widgets.push({
          id: uid(),
          kind: "bookmarks",
          url: "",
          customTitle: (asString(node["@_text"]) || asString(node["@_title"])).trim() || "Favourites",
          column,
          bookmarks,
        });
        bookmarkCount += bookmarks.length;
        continue;
      }

      const url = (node["@_xmlUrl"] || "").trim();
      if (!url) {
        skipped++;
        continue;
      }
      const prefs = parsePseudoJson(node["@_prefs"]);
      const customTitle =
        (typeof prefs._t === "string" && prefs._t) ||
        asString(node["@_lumenTitle"]).trim() ||
        undefined;
      widgets.push({ id: uid(), url, customTitle, column });
      feedCount++;
    }

    // Count outlines we didn't import (e.g. uStart "liens" link tiles).
    skipped += items.length - feeds.length - favTiles.length;

    tabs.push({ id: uid(), name, columns, widgets });
  }

  if (tabs.length === 0) throw new Error("No RSS feeds found in this file.");
  return { tabs, feedCount, bookmarkCount, skipped };
}

// ── Export ───────────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function buildOpml(state: DashboardState): string {
  const tabsXml = state.tabs
    .map((tab) => {
      // Row = position inside the column, so the order is preserved on re-import.
      const rowInColumn = new Map<number, number>();
      const nextRow = (col: number) => {
        const r = rowInColumn.get(col) ?? 0;
        rowInColumn.set(col, r + 1);
        return r;
      };

      const feedsXml = tab.widgets
        .map((w) => {
          const pos = ` pos="{'col':${w.column},'row':${nextRow(w.column)}}"`;
          if (w.kind === "bookmarks") {
            const bkXml = (w.bookmarks ?? [])
              .map(
                (b) =>
                  `      <outline type="link" text="${esc(b.title)}" url="${esc(b.url)}" />`,
              )
              .join("\n");
            return `    <outline text="${esc(w.customTitle ?? "Favourites")}" type="favourites"${pos}>\n${bkXml}\n    </outline>`;
          }
          const titleAttr = w.customTitle
            ? ` title="${esc(w.customTitle)}" lumenTitle="${esc(w.customTitle)}"`
            : "";
          return `    <outline type="rss" text="${esc(w.customTitle ?? w.url)}"${titleAttr} xmlUrl="${esc(w.url)}"${pos} />`;
        })
        .join("\n");
      return `  <outline text="${esc(tab.name)}" title="${esc(tab.name)}" lumenColumns="${tab.columns}">\n${feedsXml}\n  </outline>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Lumen RSS Dashboard export</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${tabsXml}
  </body>
</opml>`;
}
