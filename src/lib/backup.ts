// Full-fidelity JSON backup of the dashboard.
//
// Unlike OPML (a feed list that other readers understand), the JSON backup
// contains everything Lumen stores: tabs, feeds, bookmark tiles, columns,
// tile styles and display options.
//
// File format (version 1):
//   { "app": "lumen-rss", "version": 1, "exportedAt": "<ISO date>", "data": <DashboardState> }
//
// Older exports were the bare DashboardState (no envelope); they are still accepted.
//
// parseBackup() never trusts its input: every field is validated and repaired,
// because whatever it returns ends up in the app state and then in Firestore.

import type {
  Bookmark,
  DashboardState,
  DashboardTab,
  FeedWidget,
  TileStyle,
} from "./rss";
import { MAX_COLUMNS, MIN_COLUMNS } from "./opml";
import { uid } from "./utils";

export const BACKUP_APP = "lumen-rss";
export const BACKUP_VERSION = 1;

const TILE_STYLES: readonly TileStyle[] = [
  "full",
  "condensed",
  "compact",
  "comfortable",
  "mini",
];

export interface BackupSummary {
  tabCount: number;
  feedCount: number;
  bookmarkCount: number;
  /** Items dropped because they were unusable (e.g. a feed without a valid URL). */
  skipped: number;
}

export interface ParsedBackup {
  state: DashboardState;
  summary: BackupSummary;
}

// ── Export ───────────────────────────────────────────────────────────────────

export function buildBackupJson(state: DashboardState): string {
  return JSON.stringify(
    {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
}

// ── Download helpers (shared by the Data dialog and the backup reminder) ──────

/** Saves `content` as a file through the browser's download mechanism. */
export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "2026-10-12-14-30-05": safe to use inside a file name. */
export function fileTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/** Downloads the full JSON backup of `state`. */
export function downloadJsonBackup(state: DashboardState) {
  downloadFile(buildBackupJson(state), `lumen-backup-${fileTimestamp()}.json`, "application/json");
}

export function summarizeState(state: DashboardState): Omit<BackupSummary, "skipped"> {
  let feedCount = 0;
  let bookmarkCount = 0;
  for (const tab of state.tabs) {
    for (const w of tab.widgets) {
      if (w.kind === "bookmarks") bookmarkCount += w.bookmarks?.length ?? 0;
      else feedCount++;
    }
  }
  return { tabCount: state.tabs.length, feedCount, bookmarkCount };
}

// ── Import: normalisation helpers ───────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isHttpUrl(s: string): boolean {
  try {
    const p = new URL(s).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

function style(v: unknown): TileStyle | undefined {
  return TILE_STYLES.includes(v as TileStyle) ? (v as TileStyle) : undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Fields we don't know about are preserved (minus null/undefined), so a field
 * added to the app in the future is not silently dropped — and then erased from
 * Firestore on the next save — by a normaliser that predates it.
 */
function extras(
  raw: Record<string, unknown>,
  known: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (known.includes(k) || UNSAFE_KEYS.has(k)) continue;
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

const STATE_KEYS = [
  "tabs",
  "activeTabId",
  "globalDefaultStyle",
  "highlightNew",
  // written by the sync layer, not part of the dashboard itself
  "updatedAt",
  "schemaVersion",
] as const;
const TAB_KEYS = ["id", "name", "columns", "widgets", "defaultStyle"] as const;
const WIDGET_KEYS = [
  "id",
  "kind",
  "url",
  "customTitle",
  "column",
  "style",
  "bookmarks",
] as const;

/** Returns `id` if it is a usable, not-yet-seen string; otherwise a fresh one. */
function uniqueId(id: unknown, seen: Set<string>): string {
  let out = str(id);
  if (!out || seen.has(out)) {
    do out = uid();
    while (seen.has(out));
  }
  seen.add(out);
  return out;
}

function normalizeBookmarks(raw: unknown, seen: Set<string>): Bookmark[] {
  if (!Array.isArray(raw)) return [];
  const out: Bookmark[] = [];
  for (const b of raw) {
    if (!isObject(b)) continue;
    const url = str(b.url);
    if (!isHttpUrl(url)) continue;
    out.push({ id: uniqueId(b.id, seen), url, title: str(b.title) || url });
  }
  return out;
}

function normalizeWidget(
  raw: unknown,
  columns: number,
  seen: Set<string>,
): FeedWidget | null {
  if (!isObject(raw)) return null;

  const col = Number(raw.column);
  const column = Number.isFinite(col)
    ? Math.min(Math.max(Math.floor(col), 0), columns - 1)
    : 0;
  const customTitle = str(raw.customTitle) || undefined;
  const widgetStyle = style(raw.style);

  if (raw.kind === "bookmarks") {
    const w = {
      ...extras(raw, WIDGET_KEYS),
      id: uniqueId(raw.id, seen),
      kind: "bookmarks",
      url: "",
      customTitle: customTitle ?? "Favourites",
      column,
      bookmarks: normalizeBookmarks(raw.bookmarks, seen),
    } as FeedWidget;
    if (widgetStyle) w.style = widgetStyle;
    return w;
  }

  const url = str(raw.url);
  if (!isHttpUrl(url)) return null;
  const w = {
    ...extras(raw, WIDGET_KEYS),
    id: uniqueId(raw.id, seen),
    url,
    column,
  } as FeedWidget;
  if (customTitle) w.customTitle = customTitle;
  if (widgetStyle) w.style = widgetStyle;
  return w;
}

// ── Import ───────────────────────────────────────────────────────────────────

export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!isObject(json)) throw new Error("Not a Lumen backup file.");

  // Envelope (v1+) or legacy bare state.
  let data: unknown = json;
  if ("app" in json || "data" in json) {
    if (json.app !== BACKUP_APP) throw new Error("Not a Lumen backup file.");
    if (typeof json.version === "number" && json.version > BACKUP_VERSION) {
      throw new Error(
        "This backup was created by a newer version of Lumen. Update the app and try again.",
      );
    }
    data = json.data;
  }
  return normalizeDashboardState(data);
}

/**
 * Validates and repairs a dashboard state coming from anywhere untrusted:
 * a backup file, or the document read back from Firestore.
 * Throws if there is no usable dashboard in it.
 */
export function normalizeDashboardState(data: unknown): ParsedBackup {
  if (!isObject(data) || !Array.isArray(data.tabs)) {
    throw new Error("Not a Lumen backup file (no tabs found).");
  }

  const seen = new Set<string>();
  let skipped = 0;
  const tabs: DashboardTab[] = [];

  data.tabs.forEach((rawTab, i) => {
    if (!isObject(rawTab)) {
      skipped++;
      return;
    }
    const declared = Number(rawTab.columns);
    const columns = Math.max(
      MIN_COLUMNS,
      Math.min(MAX_COLUMNS, Number.isFinite(declared) ? Math.floor(declared) : 3),
    );
    const widgets: FeedWidget[] = [];
    for (const rw of Array.isArray(rawTab.widgets) ? rawTab.widgets : []) {
      const w = normalizeWidget(rw, columns, seen);
      if (w) widgets.push(w);
      else skipped++;
    }
    const tab = {
      ...extras(rawTab, TAB_KEYS),
      id: uniqueId(rawTab.id, seen),
      name: str(rawTab.name) || `Tab ${i + 1}`,
      columns,
      widgets,
    } as DashboardTab;
    const tabStyle = style(rawTab.defaultStyle);
    if (tabStyle) tab.defaultStyle = tabStyle;
    tabs.push(tab);
  });

  if (tabs.length === 0) throw new Error("The backup contains no tabs.");

  // Keep the saved active tab only if it still exists.
  const activeTabId = tabs.some((t) => t.id === data.activeTabId)
    ? (data.activeTabId as string)
    : tabs[0].id;

  const state = {
    ...extras(data, STATE_KEYS),
    tabs,
    activeTabId,
    globalDefaultStyle: style(data.globalDefaultStyle) ?? "full",
    highlightNew: typeof data.highlightNew === "boolean" ? data.highlightNew : true,
  } as DashboardState;

  return { state, summary: { ...summarizeState(state), skipped } };
}

/**
 * Copy tabs with brand-new ids (tabs, widgets, bookmarks) so they can be added
 * next to existing ones without id collisions.
 */
export function withFreshIds(tabs: DashboardTab[]): DashboardTab[] {
  return tabs.map((t) => ({
    ...t,
    id: uid(),
    widgets: t.widgets.map((w) => ({
      ...w,
      id: uid(),
      ...(w.bookmarks
        ? { bookmarks: w.bookmarks.map((b) => ({ ...b, id: uid() })) }
        : {}),
    })),
  }));
}
