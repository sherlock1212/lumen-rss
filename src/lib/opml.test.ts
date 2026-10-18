import { describe, expect, it } from "vitest";
import { buildOpml, parseOpml, MAX_COLUMNS, MIN_COLUMNS } from "./opml";
import { dashboard, tab, widget } from "@/test/data";

describe("OPML export → import round trip", () => {
  it("keeps tabs, columns, order, titles and bookmarks", () => {
    const state = dashboard([
      tab(
        "T1",
        [
          widget("a", 0, { customTitle: 'Tom & "Jerry" <news>' }),
          widget("b", 0),
          widget("c", 2),
          {
            id: "f",
            kind: "bookmarks",
            url: "",
            column: 1,
            customTitle: "Fav",
            bookmarks: [{ id: "b1", url: "https://a.example/?x=1&y=2", title: "A & B" }],
          },
        ],
        3,
      ),
      tab("T2", [widget("d", 1)], 4),
    ]);
    const out = parseOpml(buildOpml(state));
    expect(out.tabs.map((t) => [t.name, t.columns])).toEqual([
      ["Tab T1", 3],
      ["Tab T2", 4],
    ]);
    expect(out.feedCount).toBe(4); // a, b, c, d (the bookmarks tile is not a feed)
    expect(out.bookmarkCount).toBe(1);
    const t1 = out.tabs[0].widgets;
    expect(t1.find((w) => w.customTitle === 'Tom & "Jerry" <news>')).toBeTruthy();
    // order inside column 0 is preserved: a then b
    const col0 = t1.filter((w) => w.column === 0).map((w) => w.url);
    expect(col0).toEqual(["https://example.com/a.xml", "https://example.com/b.xml"]);
    const fav = t1.find((w) => w.kind === "bookmarks")!;
    expect(fav.column).toBe(1);
    expect(fav.bookmarks![0]).toMatchObject({ url: "https://a.example/?x=1&y=2", title: "A & B" });
  });

  it("escapes XML special characters in the output", () => {
    const xml = buildOpml(dashboard([tab("T", [widget("a", 0, { customTitle: "<b>&" })])]));
    expect(xml).not.toContain('<b>&"');
    expect(xml).toContain("&lt;b&gt;&amp;");
  });
});

describe("parseOpml", () => {
  it("wraps flat feeds into one 'Imported' tab", () => {
    const out = parseOpml(`<opml version="2.0"><body>
      <outline type="rss" text="One" xmlUrl="https://one.example/rss"/>
      <outline type="rss" text="Two" xmlUrl="https://two.example/rss"/></body></opml>`);
    expect(out.tabs).toHaveLength(1);
    expect(out.tabs[0].name).toBe("Imported");
    expect(out.feedCount).toBe(2);
  });

  it("reads folders as tabs, ignores empty ones", () => {
    const out = parseOpml(`<opml version="2.0"><body>
      <outline text="News"><outline type="rss" xmlUrl="https://n.example/rss"/></outline>
      <outline text="Empty"></outline></body></opml>`);
    expect(out.tabs.map((t) => t.name)).toEqual(["News"]);
  });

  it("reads uStart positions and prefs (single-quoted pseudo-JSON)", () => {
    const out = parseOpml(`<opml version="2.0"><body><outline text="Home">
      <outline type="rss" text="Second" xmlUrl="https://b.example/rss" pos="{'col':1,'row':0}" prefs="{&quot;_t&quot;:&quot;My title&quot;}"/>
      <outline type="rss" text="First" xmlUrl="https://a.example/rss" pos="{'col':0,'row':0}"/>
      </outline></body></opml>`);
    const w = out.tabs[0].widgets;
    expect(w.map((x) => x.url)).toEqual(["https://a.example/rss", "https://b.example/rss"]);
    expect(w.map((x) => x.column)).toEqual([0, 1]);
    expect(out.tabs[0].columns).toBe(MIN_COLUMNS);
    expect(w[1].customTitle).toBe("My title");
  });

  it("clamps columns to the supported range", () => {
    const out = parseOpml(`<opml version="2.0"><body><outline text="Wide" lumenColumns="9">
      <outline type="rss" xmlUrl="https://a.example/rss" pos="{'col':8,'row':0}"/></outline></body></opml>`);
    expect(out.tabs[0].columns).toBe(MAX_COLUMNS);
    expect(out.tabs[0].widgets[0].column).toBe(MAX_COLUMNS - 1);
  });

  it("counts outlines it cannot import", () => {
    const out = parseOpml(`<opml version="2.0"><body><outline text="Home">
      <outline type="rss" xmlUrl="https://a.example/rss"/>
      <outline type="liens" text="Links tile"/></outline></body></opml>`);
    expect(out.feedCount).toBe(1);
    expect(out.skipped).toBe(1);
  });

  it("drops bookmarks with unsafe URLs", () => {
    const out = parseOpml(`<opml version="2.0"><body><outline text="Home">
      <outline type="favourites" text="Fav">
        <outline type="link" text="ok" url="https://ok.example/"/>
        <outline type="link" text="bad" url="javascript:alert(1)"/></outline></outline></body></opml>`);
    expect(out.bookmarkCount).toBe(1);
  });

  it("gives every imported tab and tile its own id", () => {
    const out = parseOpml(buildOpml(dashboard([tab("T", [widget("a", 0), widget("b", 1)])])));
    const ids = [out.tabs[0].id, ...out.tabs[0].widgets.map((w) => w.id)];
    expect(new Set(ids).size).toBe(3);
  });

  it("rejects files that are not OPML or have no feeds", () => {
    expect(() => parseOpml("<html/>")).toThrow("Not a valid OPML");
    expect(() => parseOpml(`<opml version="2.0"><body></body></opml>`)).toThrow();
    expect(() =>
      parseOpml(`<opml version="2.0"><body><outline text="Empty"/></body></opml>`),
    ).toThrow("No RSS feeds");
  });
});
