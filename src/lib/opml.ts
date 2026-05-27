// Parse OPML / uStart.org XML exports into dashboard tabs.
// uStart format: <opml><body><outline title="Tab"><outline type="rss"
//   xmlUrl="..." prefs="{'URL':&quot;...&quot;,'_t':&quot;Custom Title&quot;}"
//   pos="{'col':0,'row':1}" /></outline>...</body></opml>
// Standard OPML is also supported (title/text + xmlUrl, no prefs/pos).

import { XMLParser } from "fast-xml-parser";
import type { DashboardTab, FeedWidget } from "./rss";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

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
  "@_prefs"?: string;
  "@_pos"?: string;
  outline?: RawOutline | RawOutline[];
};

export interface ImportResult {
  tabs: DashboardTab[];
  feedCount: number;
  skipped: number;
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

    if (feeds.length === 0) continue;

    // Determine column layout (max col + 1, clamped to 2..4)
    let maxCol = 0;
    const positioned = feeds.map((f) => {
      const pos = parsePseudoJson(f["@_pos"]);
      const col = typeof pos.col === "number" ? pos.col : 0;
      const row = typeof pos.row === "number" ? pos.row : 0;
      if (col > maxCol) maxCol = col;
      return { f, col, row };
    });
    const columns = Math.max(2, Math.min(4, maxCol + 1));

    positioned.sort((a, b) => a.col - b.col || a.row - b.row);

    const widgets: FeedWidget[] = [];
    for (const { f, col } of positioned) {
      const url = (f["@_xmlUrl"] || "").trim();
      if (!url) {
        skipped++;
        continue;
      }
      const prefs = parsePseudoJson(f["@_prefs"]);
      const customTitle =
        typeof prefs._t === "string" ? (prefs._t as string) : undefined;
      widgets.push({
        id: uid(),
        url,
        customTitle,
        column: Math.min(col, columns - 1),
      });
      feedCount++;
    }

    // Count outlines we didn't import (e.g. uStart "liens" link tiles).
    skipped += items.length - feeds.length;

    tabs.push({ id: uid(), name, columns, widgets });
  }

  if (tabs.length === 0) throw new Error("No RSS feeds found in this file.");
  return { tabs, feedCount, skipped };
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
