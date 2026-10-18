// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_APP,
  BACKUP_VERSION,
  buildBackupJson,
  downloadFile,
  fileTimestamp,
  normalizeDashboardState,
  parseBackup,
  summarizeState,
  withFreshIds,
} from "./backup";
import { dashboard, tab, widget } from "@/test/data";
import type { DashboardState } from "./rss";

const sample = (): DashboardState =>
  dashboard(
    [
      tab("T1", [
        widget("w1", 0, { customTitle: "Mine", style: "mini" }),
        widget("w2", 1),
        {
          id: "w3",
          kind: "bookmarks",
          url: "",
          column: 2,
          customTitle: "Fav",
          bookmarks: [{ id: "b1", url: "https://a.example/", title: "A" }],
        },
      ]),
      tab("T2", [], 4),
    ],
    "T2",
  );

describe("backup round trip", () => {
  it("exports and re-imports without losing anything", () => {
    const state = sample();
    const parsed = parseBackup(buildBackupJson(state));
    expect(parsed.state).toEqual(state);
    expect(parsed.summary).toEqual({ tabCount: 2, feedCount: 2, bookmarkCount: 1, skipped: 0 });
  });

  it("wraps the state in a labelled envelope", () => {
    const json = JSON.parse(buildBackupJson(sample()));
    expect(json.app).toBe(BACKUP_APP);
    expect(json.version).toBe(BACKUP_VERSION);
    expect(typeof json.exportedAt).toBe("string");
  });

  it("also accepts a bare state (older files)", () => {
    const state = sample();
    expect(parseBackup(JSON.stringify(state)).state).toEqual(state);
  });
});

describe("parseBackup errors", () => {
  it("rejects invalid JSON and non-objects", () => {
    expect(() => parseBackup("{nope")).toThrow("not valid JSON");
    expect(() => parseBackup("[1,2]")).toThrow("Not a Lumen backup");
    expect(() => parseBackup("42")).toThrow("Not a Lumen backup");
  });

  it("rejects files from another app", () => {
    expect(() => parseBackup(JSON.stringify({ app: "other", version: 1, data: sample() }))).toThrow(
      "Not a Lumen backup",
    );
  });

  it("rejects a newer backup version with a helpful message", () => {
    const text = JSON.stringify({ app: BACKUP_APP, version: BACKUP_VERSION + 1, data: sample() });
    expect(() => parseBackup(text)).toThrow("newer version");
  });

  it("rejects a file without tabs, or with only unusable tabs", () => {
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 1, data: {} }))).toThrow(
      "no tabs",
    );
    expect(() => parseBackup(JSON.stringify({ tabs: [] }))).toThrow("no tabs");
    expect(() => parseBackup(JSON.stringify({ tabs: [null, 5] }))).toThrow("no tabs");
  });
});

describe("normalizeDashboardState (repairs untrusted data)", () => {
  it("clamps columns and tile positions", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        {
          id: "t",
          name: "X",
          columns: 99,
          widgets: [
            { id: "a", url: "https://a.example/", column: 50 },
            { id: "b", url: "https://b.example/", column: -3 },
            { id: "c", url: "https://c.example/", column: "oops" },
          ],
        },
      ],
    });
    expect(state.tabs[0].columns).toBe(4);
    expect(state.tabs[0].widgets.map((w) => w.column)).toEqual([3, 0, 0]);
  });

  it("uses 3 columns when the value is missing or broken", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        { id: "t", widgets: [] },
        { id: "u", columns: "x", widgets: [] },
      ],
    });
    expect(state.tabs.map((t) => t.columns)).toEqual([3, 3]);
  });

  it("skips feeds without a valid http(s) URL and counts them", () => {
    const { state, summary } = normalizeDashboardState({
      tabs: [
        {
          id: "t",
          name: "X",
          columns: 2,
          widgets: [
            { id: "ok", url: "https://ok.example/feed" },
            { id: "js", url: "javascript:alert(1)" },
            { id: "empty", url: "" },
            "garbage",
            null,
          ],
        },
      ],
    });
    expect(state.tabs[0].widgets.map((w) => w.id)).toEqual(["ok"]);
    expect(summary.skipped).toBe(4);
  });

  it("drops bookmarks with unsafe URLs", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        {
          id: "t",
          columns: 2,
          widgets: [
            {
              id: "f",
              kind: "bookmarks",
              bookmarks: [
                { id: "1", url: "https://ok.example/", title: "OK" },
                { id: "2", url: "javascript:alert(1)", title: "Bad" },
                { id: "3", url: "https://no-title.example/" },
              ],
            },
          ],
        },
      ],
    });
    const bm = state.tabs[0].widgets[0].bookmarks!;
    expect(bm.map((b) => b.url)).toEqual(["https://ok.example/", "https://no-title.example/"]);
    expect(bm[1].title).toBe("https://no-title.example/"); // title falls back to the URL
  });

  it("gives fresh ids to duplicated or missing ids", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        {
          id: "same",
          columns: 2,
          widgets: [{ id: "same", url: "https://a.example/" }, { url: "https://b.example/" }],
        },
        { id: "same", columns: 2, widgets: [] },
      ],
    });
    const all = [
      ...state.tabs.map((t) => t.id),
      ...state.tabs.flatMap((t) => t.widgets.map((w) => w.id)),
    ];
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((id) => id.length > 0)).toBe(true);
  });

  it("names unnamed tabs", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        { id: "a", columns: 2, widgets: [] },
        { id: "b", name: "  ", columns: 2, widgets: [] },
      ],
    });
    expect(state.tabs.map((t) => t.name)).toEqual(["Tab 1", "Tab 2"]);
  });

  it("keeps the saved active tab only if it exists, and fills defaults", () => {
    const base = {
      tabs: [
        { id: "a", columns: 2, widgets: [] },
        { id: "b", columns: 2, widgets: [] },
      ],
    };
    expect(normalizeDashboardState({ ...base, activeTabId: "b" }).state.activeTabId).toBe("b");
    expect(normalizeDashboardState({ ...base, activeTabId: "zzz" }).state.activeTabId).toBe("a");
    const s = normalizeDashboardState(base).state;
    expect(s.globalDefaultStyle).toBe("full");
    expect(s.highlightNew).toBe(true);
    expect(
      normalizeDashboardState({ ...base, highlightNew: false, globalDefaultStyle: "mini" }).state,
    ).toMatchObject({
      highlightNew: false,
      globalDefaultStyle: "mini",
    });
    expect(
      normalizeDashboardState({ ...base, globalDefaultStyle: "weird" }).state.globalDefaultStyle,
    ).toBe("full");
  });

  it("preserves unknown fields (future versions) but not prototype tricks", () => {
    const raw = JSON.parse(`{
      "tabs":[{"id":"a","columns":2,"futureTabField":{"x":1},"widgets":[
        {"id":"w","url":"https://a.example/","futureWidgetField":7,"__proto__":{"polluted":true}}]}],
      "futureStateField":"keep me","nothing":null}`);
    const { state } = normalizeDashboardState(raw);
    expect((state as any).futureStateField).toBe("keep me");
    expect("nothing" in state).toBe(false);
    expect((state.tabs[0] as any).futureTabField).toEqual({ x: 1 });
    expect((state.tabs[0].widgets[0] as any).futureWidgetField).toBe(7);
    expect(({} as any).polluted).toBeUndefined();
    expect((state.tabs[0].widgets[0] as any).polluted).toBeUndefined();
  });

  it("does not carry sync bookkeeping fields over", () => {
    const { state } = normalizeDashboardState({
      schemaVersion: 1,
      updatedAt: "x",
      tabs: [{ id: "a", columns: 2, widgets: [] }],
    });
    expect("schemaVersion" in state).toBe(false);
    expect("updatedAt" in state).toBe(false);
  });

  it("ignores unknown tile styles", () => {
    const { state } = normalizeDashboardState({
      tabs: [
        {
          id: "a",
          columns: 2,
          defaultStyle: "nope",
          widgets: [{ id: "w", url: "https://a.example/", style: "nope" }],
        },
      ],
    });
    expect(state.tabs[0].defaultStyle).toBeUndefined();
    expect(state.tabs[0].widgets[0].style).toBeUndefined();
  });
});

describe("summarizeState / withFreshIds / helpers", () => {
  it("counts tabs, feeds and bookmarks", () => {
    expect(summarizeState(sample())).toEqual({ tabCount: 2, feedCount: 2, bookmarkCount: 1 });
  });

  it("withFreshIds changes every id but keeps everything else", () => {
    const tabs = sample().tabs;
    const fresh = withFreshIds(tabs);
    const oldIds = new Set([
      ...tabs.map((t) => t.id),
      ...tabs.flatMap((t) =>
        t.widgets.flatMap((w) => [w.id, ...(w.bookmarks ?? []).map((b) => b.id)]),
      ),
    ]);
    const newIds = [
      ...fresh.map((t) => t.id),
      ...fresh.flatMap((t) =>
        t.widgets.flatMap((w) => [w.id, ...(w.bookmarks ?? []).map((b) => b.id)]),
      ),
    ];
    expect(newIds.some((id) => oldIds.has(id))).toBe(false);
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(fresh[0].widgets[0]).toMatchObject({
      url: "https://example.com/w1.xml",
      customTitle: "Mine",
      style: "mini",
    });
    expect(fresh[0].widgets[2].bookmarks![0]).toMatchObject({
      url: "https://a.example/",
      title: "A",
    });
  });

  it("fileTimestamp is safe for file names", () => {
    expect(fileTimestamp(new Date("2026-10-12T14:30:05Z"))).toBe("2026-10-12-14-30-05");
  });

  it("downloadFile creates a temporary link, clicks it and cleans up", () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:fake");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadFile("hello", "x.txt", "text/plain");
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull(); // removed again
    expect(revoke).not.toHaveBeenCalled(); // not immediately (can cancel the download)
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:fake");
    vi.useRealTimers();
  });
});
