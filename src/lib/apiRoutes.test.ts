// The two server endpoints, called the way the server calls them, with a fake "internet".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rss } from "@/test/data";
import { fakeToken } from "@/test/token";
import { forgetAccessAnswers } from "@/lib/serverAccess";

// createFileRoute(path)(options) normally builds a route object; here we just keep the options.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));

type Handlers = Record<string, (ctx: { request: Request }) => Promise<Response>>;
async function handlers(path: "feed" | "discover-feed"): Promise<Handlers> {
  const mod = await import(`../routes/api/${path}.ts`);
  return (mod.Route as any).options.server.handlers;
}

const APP = "https://lumen.example";
// Every request carries a login token, unless a test says otherwise.
const SIGNED_IN = { Authorization: `Bearer ${fakeToken()}` };
const get = (h: Handlers, target: string | null, headers: Record<string, string> = SIGNED_IN) =>
  h.GET({
    request: new Request(
      `${APP}/api/x${target === null ? "" : `?url=${encodeURIComponent(target)}`}`,
      { headers },
    ),
  });

type Site = Record<string, () => Response>;
let calls: string[];
// What the "database" answers when the server asks whether the caller is allowed.
let allowlistStatus = 200;
let lookups: string[];
function fakeInternet(site: Site) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (String(input).startsWith("https://firestore.googleapis.com/")) {
        lookups.push(String(input));
        return new Response(null, { status: allowlistStatus });
      }
      calls.push(String(input));
      const make = site[String(input)];
      return make ? make() : new Response("not found", { status: 404 });
    }),
  );
}
const xml =
  (body: string, type = "application/rss+xml") =>
  () =>
    new Response(body, { headers: { "content-type": type } });

beforeEach(() => {
  calls = [];
  lookups = [];
  allowlistStatus = 200;
  forgetAccessAnswers();
});
afterEach(() => vi.unstubAllGlobals());

describe("/api/feed", () => {
  it("returns parsed, normalised JSON", async () => {
    fakeInternet({
      "https://news.example/rss": xml(
        rss(
          [
            { title: "One", link: "/a/1" },
            { title: "Two", link: "javascript:alert(1)" },
          ],
          "https://news.example/",
        ),
      ),
    });
    const res = await get(await handlers("feed"), "https://news.example/rss");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    const body = await res.json();
    expect(body.title).toBe("Test feed");
    expect(body.items.map((i: any) => i.link)).toEqual(["https://news.example/a/1", ""]);
    expect(typeof body.fetchedAt).toBe("string");
  });

  it("returns at most 30 entries", async () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      title: `T${i}`,
      link: `https://n.example/${i}`,
    }));
    fakeInternet({ "https://n.example/rss": xml(rss(items)) });
    const body = await (await get(await handlers("feed"), "https://n.example/rss")).json();
    expect(body.items).toHaveLength(30);
  });

  it("decodes accented characters from ISO-8859-1 feeds", async () => {
    const head = new TextEncoder().encode(
      '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Citt',
    );
    const tail = new TextEncoder().encode("</title></channel></rss>");
    const body = new Uint8Array([...head, 0xe0, ...tail]); // "à"
    fakeInternet({
      "https://it.example/rss": () =>
        new Response(body, { headers: { "content-type": "text/xml" } }),
    });
    const json = await (await get(await handlers("feed"), "https://it.example/rss")).json();
    expect(json.title).toBe("Città");
  });

  it("follows a redirect and resolves links against the final site", async () => {
    fakeInternet({
      "https://old.example/rss": () =>
        new Response(null, { status: 301, headers: { location: "https://new.example/feed" } }),
      "https://new.example/feed": xml(
        `<rss><channel><title>T</title><item><title>I</title><link>/p</link></item></channel></rss>`,
      ),
    });
    const json = await (await get(await handlers("feed"), "https://old.example/rss")).json();
    expect(json.items[0].link).toBe("https://new.example/p");
  });

  it("400 without url", async () => {
    fakeInternet({});
    const res = await get(await handlers("feed"), null);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing url param");
  });

  it.each([
    "http://127.0.0.1/",
    "http://localhost/x",
    "http://169.254.169.254/",
    "http://intranet/",
    "ftp://x.example/",
  ])("refuses %s without contacting it", async (target) => {
    fakeInternet({});
    const res = await get(await handlers("feed"), target);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses a public URL that redirects to an internal one", async () => {
    fakeInternet({
      "https://evil.example/r": () =>
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    });
    const res = await get(await handlers("feed"), "https://evil.example/r");
    expect(res.status).toBe(400);
    expect(calls).toEqual(["https://evil.example/r"]);
  });

  it("keeps the 'Upstream <status>' message the UI relies on", async () => {
    fakeInternet({ "https://n.example/rss": () => new Response("no", { status: 403 }) });
    const res = await get(await handlers("feed"), "https://n.example/rss");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Upstream 403");
  });

  it("502 when the page is not a feed", async () => {
    fakeInternet({ "https://n.example/": xml("<html><body>hi</body></html>", "text/html") });
    const res = await get(await handlers("feed"), "https://n.example/");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Unrecognized feed format");
  });

  it("refuses an oversized feed", async () => {
    fakeInternet({
      "https://n.example/big": () =>
        new Response("x", { headers: { "content-length": String(50 * 1024 * 1024) } }),
    });
    const res = await get(await handlers("feed"), "https://n.example/big");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Feed too large");
  });

  it("refuses other websites (Origin) but not the app itself", async () => {
    fakeInternet({ "https://n.example/rss": xml(rss([])) });
    const h = await handlers("feed");
    expect((await get(h, "https://n.example/rss", { origin: "https://evil.example" })).status).toBe(
      403,
    );
    expect(
      (await get(h, "https://n.example/rss", { origin: "https://evil.example", ...SIGNED_IN }))
        .status,
    ).toBe(403);
    expect(calls).toEqual([]);
    const ok = await get(h, "https://n.example/rss", { origin: APP, ...SIGNED_IN });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(APP);
  });

  it("answers OPTIONS (preflight) for the app and refuses others", async () => {
    const h = await handlers("feed");
    const opt = (origin: string) =>
      h.OPTIONS({
        request: new Request(`${APP}/api/feed`, { method: "OPTIONS", headers: { origin } }),
      });
    expect((await opt(APP)).status).toBe(204);
    expect((await opt("https://evil.example")).status).toBe(403);
  });
});

describe("/api/discover-feed", () => {
  it("returns the URL itself with ONE single fetch when it already is a feed", async () => {
    fakeInternet({ "https://n.example/rss": xml(rss([])) });
    const res = await get(await handlers("discover-feed"), "https://n.example/rss");
    expect(await res.json()).toEqual({ feeds: [{ url: "https://n.example/rss", title: null }] });
    expect(calls).toEqual(["https://n.example/rss"]);
  });

  it("finds the feed advertised in the page <head>", async () => {
    fakeInternet({
      "https://blog.example/": xml(
        `<html><head><link rel="alternate" type="application/rss+xml" href="/custom.xml"></head><body></body></html>`,
        "text/html; charset=utf-8",
      ),
      "https://blog.example/custom.xml": xml(rss([])),
    });
    const body = await (await get(await handlers("discover-feed"), "https://blog.example/")).json();
    expect(body.feeds).toEqual([{ url: "https://blog.example/custom.xml", title: null }]);
  });

  it("adds https:// to a bare domain", async () => {
    fakeInternet({ "https://open.example/": xml(rss([])) });
    const res = await get(await handlers("discover-feed"), "open.example");
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("https://open.example/");
  });

  it("probes common paths when the page advertises nothing", async () => {
    fakeInternet({
      "https://plain.example/": xml("<html><head></head></html>", "text/html"),
      "https://plain.example/feed.xml": xml(rss([])),
    });
    const body = await (
      await get(await handlers("discover-feed"), "https://plain.example/")
    ).json();
    expect(body.feeds[0].url).toBe("https://plain.example/feed.xml");
  });

  it("does not accept a non-feed (e.g. a sitemap) on a probed path", async () => {
    fakeInternet({
      "https://plain.example/": xml("<html></html>", "text/html"),
      "https://plain.example/feed": xml('<?xml version="1.0"?><urlset></urlset>', "text/xml"),
    });
    const res = await get(await handlers("discover-feed"), "https://plain.example/");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("No RSS/Atom feed found");
  });

  it("refuses internal targets and does not contact them", async () => {
    fakeInternet({});
    const h = await handlers("discover-feed");
    for (const t of ["http://127.0.0.1/", "localhost", "http://192.168.0.1/"]) {
      const res = await get(h, t);
      expect(res.status).toBe(400);
    }
    expect(calls).toEqual([]);
  });

  it("400 without url; 403 for other websites", async () => {
    fakeInternet({});
    const h = await handlers("discover-feed");
    expect((await get(h, null)).status).toBe(400);
    expect((await get(h, "https://n.example/", { origin: "https://evil.example" })).status).toBe(
      403,
    );
  });
});

describe("who may call the endpoints", () => {
  const FEED = "https://news.example/rss";
  const site = {
    [FEED]: xml(rss([{ title: "A", link: "https://news.example/a" }])),
  };

  for (const path of ["feed", "discover-feed"] as const) {
    it(`/api/${path}: no login token -> 401, and nothing is fetched`, async () => {
      fakeInternet(site);
      const res = await get(await handlers(path), FEED, {});
      expect(res.status).toBe(401);
      expect((await res.json()).error).toMatch(/sign in/i);
      expect(calls).toEqual([]);
      expect(lookups).toEqual([]); // not even a database lookup for an anonymous caller
    });

    it(`/api/${path}: a person who is not on the list -> 403, and nothing is fetched`, async () => {
      fakeInternet(site);
      allowlistStatus = 404;
      const res = await get(await handlers(path), FEED);
      expect(res.status).toBe(403);
      expect(calls).toEqual([]);
    });

    it(`/api/${path}: the database cannot be reached -> 503 (closed, not open)`, async () => {
      fakeInternet(site);
      allowlistStatus = 500;
      const res = await get(await handlers(path), FEED);
      expect(res.status).toBe(503);
      expect(calls).toEqual([]);
    });
  }

  it("a listed person gets the feed, and the lookup was about THEIR address", async () => {
    fakeInternet(site);
    const res = await get(await handlers("feed"), FEED, {
      Authorization: `Bearer ${fakeToken("Someone@Example.com")}`,
    });
    expect(res.status).toBe(200);
    expect(lookups).toHaveLength(1);
    expect(lookups[0]).toContain("/projects/test-project/");
    expect(lookups[0]).toContain("/allowlist/someone%40example.com");
  });

  it("the feed answer is never stored by shared caches", async () => {
    fakeInternet(site);
    const res = await get(await handlers("feed"), FEED);
    expect(res.headers.get("cache-control")).toMatch(/^private/);
  });

  it("the browser's pre-flight check needs no login", async () => {
    fakeInternet(site);
    const h = await handlers("feed");
    const res = await h.OPTIONS({
      request: new Request(`${APP}/api/feed`, { method: "OPTIONS", headers: { origin: APP } }),
    });
    expect(res.status).toBe(204);
    expect(lookups).toEqual([]);
  });
});
