import { describe, expect, it, vi } from "vitest";
import {
  MAX_FEED_BYTES,
  ProxyError,
  assertPublicUrl,
  checkOrigin,
  decodeBody,
  errorResponse,
  jsonResponse,
  looksLikeFeed,
  preflight,
  readCapped,
  readHead,
  safeFetch,
} from "./feedProxy";

const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });
const bytes = (...n: number[]) => new Uint8Array(n);
const enc = (s: string) => new TextEncoder().encode(s);
const stream = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      chunks.forEach((x) => c.enqueue(x));
      c.close();
    },
  });

describe("assertPublicUrl (SSRF guard)", () => {
  const blocked = [
    "http://localhost/feed",
    "http://localhost:8080/",
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/", // cloud metadata
    "http://100.64.0.1/",
    "http://0.0.0.0/",
    "http://224.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fd00::1]/",
    "http://intranet/feed", // single label
    "http://nas.local/feed",
    "http://printer.lan/",
    "http://thing.internal/",
    "http://x.localhost/",
    "http://localhost./", // trailing dot
    "http://user:pass@example.com/", // credentials
    "http://example.com:22/", // odd port
    "http://example.com:6379/",
    "ftp://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
  ];
  it.each(blocked)("blocks %s", (u) => {
    expect(() => assertPublicUrl(new URL(u))).toThrow(ProxyError);
  });

  const allowed = [
    "http://example.com/feed",
    "https://example.com/feed",
    "https://sub.example.co.uk/a/b?x=1",
    "https://example.com:443/",
    "http://example.com:8080/",
    "https://example.com:8443/",
    "http://172.15.0.1/", // just outside 172.16/12
    "http://172.32.0.1/",
    "https://8.8.8.8/",
  ];
  it.each(allowed)("allows %s", (u) => {
    expect(() => assertPublicUrl(new URL(u))).not.toThrow();
  });

  it("uses status 400 for blocked targets", () => {
    try {
      assertPublicUrl(new URL("http://127.0.0.1/"));
    } catch (e) {
      expect((e as ProxyError).status).toBe(400);
    }
  });
});

describe("safeFetch", () => {
  const ok = (body = "x") => new Response(body, { status: 200 });
  const redirect = (to: string, status = 302) =>
    new Response(null, { status, headers: { location: to } });

  it("fetches a public URL and reports the final URL", async () => {
    const f = vi.fn(async () => ok());
    const { res, finalUrl } = await safeFetch("https://example.com/a", {}, f);
    expect(res.status).toBe(200);
    expect(finalUrl).toBe("https://example.com/a");
  });

  it("never lets fetch follow redirects by itself", async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => ok());
    await safeFetch("https://example.com/", { headers: { A: "b" } }, f);
    expect(f.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { A: "b" } });
  });

  it("follows redirects (relative too) and returns the last URL", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(redirect("/moved"))
      .mockResolvedValueOnce(redirect("https://other.example/final", 301))
      .mockResolvedValueOnce(ok());
    const { finalUrl } = await safeFetch("https://example.com/a", {}, f);
    expect(finalUrl).toBe("https://other.example/final");
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "https://example.com/a",
      "https://example.com/moved",
      "https://other.example/final",
    ]);
  });

  it("blocks a redirect to an internal address (and never fetches it)", async () => {
    for (const target of [
      "http://127.0.0.1/admin",
      "http://169.254.169.254/",
      "http://localhost/",
      "http://intranet/",
    ]) {
      const f = vi.fn().mockResolvedValueOnce(redirect(target));
      await expect(safeFetch("https://example.com/", {}, f)).rejects.toThrow(ProxyError);
      expect(f).toHaveBeenCalledTimes(1); // only the first, public, request was made
    }
  });

  it("blocks the first URL too, without fetching", async () => {
    const f = vi.fn();
    await expect(safeFetch("http://127.0.0.1/", {}, f)).rejects.toThrow("Address not allowed");
    expect(f).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs", async () => {
    await expect(safeFetch("not a url", {}, vi.fn())).rejects.toThrow("Invalid url");
  });

  it("stops redirect loops (502)", async () => {
    const f = vi.fn(async () => redirect("https://example.com/again"));
    await expect(safeFetch("https://example.com/", {}, f)).rejects.toMatchObject({
      message: "Too many redirects",
      status: 502,
    });
    expect(f.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it("returns a 3xx without Location as it is", async () => {
    const f = vi.fn(async () => new Response(null, { status: 304 }));
    const { res } = await safeFetch("https://example.com/", {}, f);
    expect(res.status).toBe(304);
  });
});

describe("readCapped", () => {
  it("reads a normal body", async () => {
    const out = await readCapped(new Response(stream([enc("hel"), enc("lo")])), 100);
    expect(new TextDecoder().decode(out)).toBe("hello");
  });

  it("refuses when Content-Length already says it is too big", async () => {
    const res = new Response("x", { headers: { "content-length": "999999" } });
    await expect(readCapped(res, 1000)).rejects.toMatchObject({
      message: "Feed too large",
      status: 502,
    });
  });

  it("aborts a streamed body that grows past the limit (no Content-Length)", async () => {
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        c.enqueue(new Uint8Array(400));
        if (pulled > 50) c.close();
      },
    });
    await expect(readCapped(new Response(body), 1000)).rejects.toThrow("Feed too large");
    expect(pulled).toBeLessThan(10); // stopped early instead of reading everything
  });

  it("handles an empty body", async () => {
    expect((await readCapped(new Response(null), 10)).byteLength).toBe(0);
  });

  it("has a sane default limit", () => {
    expect(MAX_FEED_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("readHead", () => {
  it("returns at most maxBytes and stops", async () => {
    const out = await readHead(new Response(stream([enc("abcdef"), enc("ghijkl")])), 8);
    expect(new TextDecoder().decode(out)).toBe("abcdefgh");
  });
  it("returns everything when the body is shorter", async () => {
    expect(new TextDecoder().decode(await readHead(new Response("short"), 100))).toBe("short");
  });
});

describe("decodeBody", () => {
  it("decodes UTF-8 (default)", () => {
    expect(decodeBody(enc("caffè € 日本"))).toBe("caffè € 日本");
  });

  it("honours the charset of the HTTP header (ISO-8859-1)", () => {
    expect(decodeBody(bytes(0x63, 0x61, 0x66, 0x66, 0xe8), "text/xml; charset=ISO-8859-1")).toBe(
      "caffè",
    );
  });

  it("treats ISO-8859-1 / windows-1252 like browsers do (€ and curly quotes)", () => {
    expect(decodeBody(bytes(0x80, 0x93, 0x94), "text/xml; charset=iso-8859-1")).toBe("€“”");
    expect(decodeBody(bytes(0x80, 0x93, 0x94), "text/xml; charset=windows-1252")).toBe("€“”");
  });

  it("reads the encoding from the XML prolog", () => {
    const body = new Uint8Array([
      ...enc('<?xml version="1.0" encoding="ISO-8859-1"?><t>'),
      0xe0,
      0xe8,
      ...enc("</t>"),
    ]);
    expect(decodeBody(body)).toContain("àè");
  });

  it("reads the encoding from an HTML meta tag", () => {
    const body = new Uint8Array([...enc('<html><head><meta charset="windows-1252"></head>'), 0x80]);
    expect(decodeBody(body)).toContain("€");
  });

  it("the HTTP header wins over the prolog", () => {
    const body = new Uint8Array([
      ...enc('<?xml version="1.0" encoding="UTF-8"?><t>'),
      0xe8,
      ...enc("</t>"),
    ]);
    expect(decodeBody(body, "text/xml; charset=iso-8859-1")).toContain("è");
  });

  it("understands BOMs (UTF-8 and UTF-16)", () => {
    expect(decodeBody(new Uint8Array([0xef, 0xbb, 0xbf, ...enc("è")]))).toContain("è");
    expect(decodeBody(new Uint8Array([0xff, 0xfe, 0xe8, 0x00]))).toBe("è");
  });

  it("falls back to UTF-8 for an unknown charset label", () => {
    expect(decodeBody(enc("ok"), "text/xml; charset=klingon")).toBe("ok");
  });

  it("does not choke on large bodies", () => {
    const big = new Uint8Array(300_000).fill(0x41);
    expect(decodeBody(big, "text/xml; charset=iso-8859-1")).toHaveLength(300_000);
  });
});

describe("looksLikeFeed", () => {
  it("recognises RSS, Atom and RDF", () => {
    expect(looksLikeFeed('<?xml version="1.0"?><rss version="2.0">')).toBe(true);
    expect(looksLikeFeed('  \n<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(looksLikeFeed("<rdf:RDF ...>")).toBe(true);
  });
  it("rejects HTML and sitemaps", () => {
    expect(looksLikeFeed("<!doctype html><html><head></head></html>")).toBe(false);
    expect(looksLikeFeed('<?xml version="1.0"?><urlset xmlns="...">')).toBe(false);
  });
});

describe("origin check (only other websites are refused)", () => {
  it("allows requests without Origin (the app itself, curl)", () => {
    expect(checkOrigin(req("https://lumen.example/api/feed"))).toBeNull();
  });
  it("allows the same origin", () => {
    expect(
      checkOrigin(req("https://lumen.example/api/feed", { origin: "https://lumen.example" })),
    ).toBeNull();
  });
  it("refuses another site (403)", async () => {
    const r = checkOrigin(
      req("https://lumen.example/api/feed", { origin: "https://evil.example" }),
    );
    expect(r?.status).toBe(403);
    expect(await r!.json()).toEqual({ error: "Origin not allowed" });
  });
  it("refuses a malformed Origin", () => {
    expect(checkOrigin(req("https://lumen.example/api/feed", { origin: "null" }))?.status).toBe(
      403,
    );
  });
  it("refuses cross-site fetches that send no Origin", () => {
    expect(
      checkOrigin(req("https://lumen.example/api/feed", { "sec-fetch-site": "cross-site" }))
        ?.status,
    ).toBe(403);
    expect(
      checkOrigin(req("https://lumen.example/api/feed", { "sec-fetch-site": "same-origin" })),
    ).toBeNull();
  });
  it("a look-alike host is not the same host", () => {
    expect(
      checkOrigin(req("https://lumen.example/x", { origin: "https://lumen.example.evil.com" }))
        ?.status,
    ).toBe(403);
  });
});

describe("responses", () => {
  it("jsonResponse echoes only an allowed Origin back (no wildcard)", async () => {
    const withOrigin = jsonResponse(
      req("https://lumen.example/x", { origin: "https://lumen.example" }),
      { a: 1 },
    );
    expect(withOrigin.headers.get("access-control-allow-origin")).toBe("https://lumen.example");
    expect(withOrigin.headers.get("vary")).toBe("Origin");
    expect(await withOrigin.json()).toEqual({ a: 1 });
    const without = jsonResponse(req("https://lumen.example/x"), {});
    expect(without.headers.get("access-control-allow-origin")).toBeNull();
    expect(without.headers.get("access-control-allow-origin")).not.toBe("*");
  });

  it("preflight: 204 for the same origin, 403 for others", () => {
    const ok = preflight(req("https://lumen.example/x", { origin: "https://lumen.example" }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(
      preflight(req("https://lumen.example/x", { origin: "https://evil.example" })).status,
    ).toBe(403);
  });

  it("errorResponse: ProxyError keeps its message and status, others become 500", async () => {
    const r1 = errorResponse(req("https://lumen.example/x"), new ProxyError("Nope", 418));
    expect(r1.status).toBe(418);
    expect(r1.headers.get("cache-control")).toBe("no-store");
    expect(await r1.json()).toEqual({ error: "Nope" });
    const r2 = errorResponse(req("https://lumen.example/x"), new Error("boom"));
    expect(r2.status).toBe(500);
  });
});
