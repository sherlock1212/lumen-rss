/**
 * Shared helpers for the server-side feed endpoints (/api/feed, /api/discover-feed).
 * Server only: never import this from client code.
 */

export const USER_AGENT =
  "Mozilla/5.0 (compatible; LumenRSS/1.0; +https://lumen-rss.sheldon88.workers.dev)";

export const MAX_FEED_BYTES = 5 * 1024 * 1024; // 5 MB: far above any real feed
export const MAX_HTML_BYTES = 512 * 1024; // enough for any <head>
const MAX_REDIRECTS = 8;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);

/** An error whose message is safe to show to the user. */
export class ProxyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// ── Origin / CORS ─────────────────────────────────────────────────────────────
// The app calls these endpoints from its own origin, so no CORS headers are needed
// for it to work. We only *refuse* browsers running pages of other websites.
// (This does not stop curl/scripts, which send no Origin: see access control.)

export function checkOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  const self = new URL(request.url);
  let allowed = true;
  if (origin) {
    try {
      allowed = new URL(origin).host === self.host;
    } catch {
      allowed = false;
    }
  } else if (site === "cross-site") {
    allowed = false;
  }
  if (allowed) return null;
  return new Response(JSON.stringify({ error: "Origin not allowed" }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Vary: "Origin",
    ...extra,
  };
  // Same-origin only: echo the Origin back when it is our own host (needed for
  // cross-origin-looking but same-host requests such as local dev on another port).
  const origin = request.headers.get("origin");
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

export function preflight(request: Request): Response {
  const blocked = checkOrigin(request);
  if (blocked) return blocked;
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
  const origin = request.headers.get("origin");
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(null, { status: 204, headers });
}

export function errorResponse(request: Request, e: unknown): Response {
  if (e instanceof ProxyError) {
    return jsonResponse(request, { error: e.message }, e.status, { "Cache-Control": "no-store" });
  }
  const msg = e instanceof Error ? e.message : "Unknown error";
  return jsonResponse(request, { error: msg }, 500, { "Cache-Control": "no-store" });
}

// ── SSRF guard ────────────────────────────────────────────────────────────────
// Workers cannot resolve DNS, so this is a name/IP-literal guard. Cloudflare also
// refuses to connect to private ranges from Workers; this is defence in depth.

function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".home.arpa",
  ".intranet",
];

export function assertPublicUrl(u: URL): void {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ProxyError("Invalid protocol");
  if (u.username || u.password) throw new ProxyError("Credentials in URL are not allowed");
  if (!ALLOWED_PORTS.has(u.port)) throw new ProxyError("Port not allowed");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new ProxyError("Invalid host");
  // IPv6 literals (the URL parser normalises every mapped/embedded form): not feed hosts.
  if (host.startsWith("[")) throw new ProxyError("Address not allowed");
  if (isPrivateIPv4(host)) throw new ProxyError("Address not allowed");
  // Bare single-label names (localhost, intranet, db...) and internal suffixes.
  if (
    !host.includes(".") ||
    host === "localhost" ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    throw new ProxyError("Address not allowed");
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * fetch() that validates the target and every redirect hop. Returns the response
 * and the final URL (needed to resolve relative links).
 */
export async function safeFetch(
  url: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = fetch,
): Promise<{ res: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      throw new ProxyError("Invalid url");
    }
    assertPublicUrl(u);
    const res = await fetchImpl(u.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = new URL(res.headers.get("location")!, u).toString();
      await res.body?.cancel().catch(() => {});
      current = next;
      continue;
    }
    return { res, finalUrl: u.toString() };
  }
  throw new ProxyError("Too many redirects", 502);
}

// ── Body reading & decoding ───────────────────────────────────────────────────

/** Read the body, aborting as soon as it exceeds maxBytes. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new ProxyError("Feed too large", 502);
  }
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ProxyError("Feed too large", 502);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function sniffCharset(bytes: Uint8Array, contentType: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  const header = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1];
  if (header) return header;
  // XML prolog / HTML meta, read as latin1 (ASCII-compatible) from the first bytes
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const prolog = /<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(head)?.[1];
  if (prolog) return prolog;
  const meta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  return meta ?? "utf-8";
}

// windows-1252 differs from ISO-8859-1 only in 0x80-0x9F. Done by hand because some
// runtimes (Node) decode "windows-1252" as plain ISO-8859-1.
const CP1252_HIGH =
  "\u20ac\u0081\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u008d\u017d\u008f" +
  "\u0090\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u009d\u017e\u0178";

function decodeCp1252(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    const part = bytes.subarray(i, i + 8192);
    out += String.fromCharCode(
      ...Array.from(part, (b) => (b >= 0x80 && b <= 0x9f ? CP1252_HIGH.charCodeAt(b - 0x80) : b)),
    );
  }
  return out;
}

/** Decode bytes using the declared charset (BOM > HTTP header > XML prolog/meta > UTF-8). */
export function decodeBody(bytes: Uint8Array, contentType = ""): string {
  const label = sniffCharset(bytes, contentType).toLowerCase();
  // Browsers (and the WHATWG spec) treat ISO-8859-1 as windows-1252.
  if (/^(iso[-_]?8859[-_]?1|latin[-_]?1|l1|us-ascii|ascii|windows-1252|cp1252)$/.test(label)) {
    return decodeCp1252(bytes);
  }
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

export const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml, */*";

export function looksLikeFeed(text: string): boolean {
  const head = text.trimStart().slice(0, 2000);
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf:RDF");
}

/** Read at most maxBytes from the body, then stop (never throws for "too big"). */
export async function readHead(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, maxBytes));
  let off = 0;
  for (const c of chunks) {
    const part = c.subarray(0, Math.max(0, out.length - off));
    out.set(part, off);
    off += part.byteLength;
  }
  return out;
}
