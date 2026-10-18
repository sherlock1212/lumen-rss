import { describe, expect, it } from "vitest";
import { normalizeLinks, parseFeed, resolveLink } from "./feedParse";

describe("parseFeed", () => {
  it("reads RSS 2.0", () => {
    const f = parseFeed(`<?xml version="1.0"?><rss version="2.0"><channel>
      <title>News</title><link>https://n.example/</link><description>All the news</description>
      <item><title>One</title><link>https://n.example/1</link><pubDate>Mon, 01 Jan 2026 10:00:00 GMT</pubDate>
        <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Ann</dc:creator></item>
      <item><title>Two</title><link>https://n.example/2</link></item>
    </channel></rss>`);
    expect(f.title).toBe("News");
    expect(f.link).toBe("https://n.example/");
    expect(f.items).toHaveLength(2);
    expect(f.items[0]).toMatchObject({ title: "One", link: "https://n.example/1", author: "Ann" });
    expect(f.items[0].description).not.toMatch(/[<>]/); // HTML is stripped
    expect(f.items[0].description).toContain("Hello");
  });

  it("reads Atom (link as attribute, summary, author)", () => {
    const f = parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Blog</title><link href="https://b.example/"/>
      <entry><title>Post</title><link href="https://b.example/p1"/><updated>2026-01-01T00:00:00Z</updated>
        <summary>Short</summary><author><name>Bob</name></author></entry>
    </feed>`);
    expect(f.title).toBe("Blog");
    expect(f.link).toBe("https://b.example/");
    expect(f.items[0]).toMatchObject({
      title: "Post",
      link: "https://b.example/p1",
      pubDate: "2026-01-01T00:00:00Z",
      description: "Short",
      author: "Bob",
    });
  });

  it("reads RSS 1.0 / RDF", () => {
    const f =
      parseFeed(`<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel><title>Old school</title><link>https://o.example/</link></channel>
      <item><title>Item</title><link>https://o.example/i</link><dc:date>2026-02-02</dc:date></item></rdf:RDF>`);
    expect(f.title).toBe("Old school");
    expect(f.items[0]).toMatchObject({
      title: "Item",
      link: "https://o.example/i",
      pubDate: "2026-02-02",
    });
  });

  it("handles a single item (not an array) and an empty feed", () => {
    const one = parseFeed(
      `<rss><channel><title>T</title><item><title>Only</title></item></channel></rss>`,
    );
    expect(one.items).toHaveLength(1);
    const none = parseFeed(`<rss><channel><title>T</title></channel></rss>`);
    expect(none.items).toEqual([]);
  });

  it("falls back to defaults for missing titles", () => {
    const f = parseFeed(
      `<rss><channel><item><link>https://x.example/1</link></item></channel></rss>`,
    );
    expect(f.title).toBe("Untitled feed");
    expect(f.items[0].title).toBe("Untitled");
  });

  it("rejects things that are not feeds", () => {
    expect(() => parseFeed("<html><body>hi</body></html>")).toThrow("Unrecognized feed format");
    expect(() => parseFeed("")).toThrow();
  });
});

describe("resolveLink", () => {
  it("makes relative links absolute", () => {
    expect(resolveLink("/a/b", "https://x.example/feed")).toBe("https://x.example/a/b");
    expect(resolveLink("post-1", "https://x.example/blog/")).toBe("https://x.example/blog/post-1");
  });

  it("drops anything that is not http(s)", () => {
    expect(resolveLink("javascript:alert(1)", "https://x.example/")).toBe("");
    expect(resolveLink("data:text/html,<b>x</b>", "https://x.example/")).toBe("");
    expect(resolveLink("mailto:a@b.c", "https://x.example/")).toBe("");
    expect(resolveLink("  JaVaScRiPt:alert(1)", "https://x.example/")).toBe("");
  });

  it("returns '' for empty or missing", () => {
    expect(resolveLink(undefined, "https://x.example/")).toBe("");
    expect(resolveLink("   ", "https://x.example/")).toBe("");
  });
});

describe("normalizeLinks", () => {
  it("resolves item links against the channel link", () => {
    const out = normalizeLinks(
      { title: "t", link: "https://site.example/", items: [{ title: "i", link: "/p/1" }] },
      "https://feeds.example/rss",
    );
    expect(out.items[0].link).toBe("https://site.example/p/1");
  });

  it("uses the feed URL when the channel link is not usable", () => {
    const out = normalizeLinks(
      { title: "t", link: "javascript:alert(1)", items: [{ title: "i", link: "/p/1" }] },
      "https://feeds.example/rss",
    );
    expect(out.link).toBeUndefined();
    expect(out.items[0].link).toBe("https://feeds.example/p/1");
  });

  it("removes dangerous item links", () => {
    const out = normalizeLinks(
      {
        title: "t",
        items: [
          { title: "i", link: "javascript:alert(1)" },
          { title: "j", link: "https://ok.example/" },
        ],
      },
      "https://feeds.example/rss",
    );
    expect(out.items.map((i) => i.link)).toEqual(["", "https://ok.example/"]);
  });
});
