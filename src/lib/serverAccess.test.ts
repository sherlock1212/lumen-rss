import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetAccessAnswers, requireAccess } from "./serverAccess";
import { fakeToken } from "@/test/token";

const REQ = (token?: string, header?: string) =>
  new Request("https://lumen.example/api/feed", {
    headers: token ? { Authorization: header ?? `Bearer ${token}` } : {},
  });

let status: number | "network-error";
let urls: string[];
let sentAuth: (string | null)[];
let clock: number;
const deps = () => ({
  projectId: "proj-1",
  now: () => clock,
  fetch: (async (url: string, init?: RequestInit) => {
    urls.push(url);
    sentAuth.push(new Headers(init?.headers).get("authorization"));
    if (status === "network-error") throw new TypeError("network down");
    return new Response(null, { status });
  }) as unknown as typeof fetch,
});

beforeEach(() => {
  status = 200;
  urls = [];
  sentAuth = [];
  clock = Date.UTC(2026, 9, 20, 12, 0, 0);
  forgetAccessAnswers();
});
afterEach(() => vi.restoreAllMocks());

const token = (email = "me@example.com", expiresIn = 3600) => fakeToken(email, expiresIn, clock);
const body = async (r: Response | null) => (await r!.json()) as { error: string };

describe("requireAccess: the caller's identity", () => {
  it("401 without an Authorization header, with no lookup", async () => {
    const r = await requireAccess(REQ(), deps());
    expect(r!.status).toBe(401);
    expect(r!.headers.get("www-authenticate")).toBe("Bearer");
    expect(urls).toEqual([]);
  });

  it.each([
    ["not a Bearer scheme", `Basic ${"x".repeat(10)}`],
    ["not a token", "Bearer hello"],
    ["three parts but not base64 json", "Bearer a.b.c"],
    ["empty", "Bearer "],
  ])("401 when the header is %s", async (_n, header) => {
    const r = await requireAccess(REQ("x", header), deps());
    expect(r!.status).toBe(401);
    expect(urls).toEqual([]);
  });

  it("401 when the token has no email", async () => {
    const t = fakeToken("x@example.com", 3600, clock).split(".");
    const noEmail = `${t[0]}.${btoa(JSON.stringify({ exp: 9999999999 })).replace(/=+$/, "")}.sig`;
    expect((await requireAccess(REQ(noEmail), deps()))!.status).toBe(401);
    expect(urls).toEqual([]);
  });

  it("401 'expired' for an expired token, with no lookup", async () => {
    const r = await requireAccess(REQ(token("me@example.com", -5)), deps());
    expect(r!.status).toBe(401);
    expect((await body(r)).error).toMatch(/expired/i);
    expect(urls).toEqual([]);
  });
});

describe("requireAccess: the list", () => {
  it("lets a listed person in, asking Firestore with THEIR token about THEIR address", async () => {
    const t = token("Mixed.Case+tag@Example.com");
    expect(await requireAccess(REQ(t), deps())).toBeNull();
    expect(urls).toEqual([
      "https://firestore.googleapis.com/v1/projects/proj-1/databases/(default)/documents/allowlist/mixed.case%2Btag%40example.com?mask.fieldPaths=role",
    ]);
    expect(sentAuth).toEqual([`Bearer ${t}`]);
  });

  it.each([404, 403])("403 when Firestore says %i (not on the list / rules refuse)", async (s) => {
    status = s;
    const r = await requireAccess(REQ(token()), deps());
    expect(r!.status).toBe(403);
    expect((await body(r)).error).toMatch(/not allowed/i);
  });

  it("401 when Firestore says the token itself is not valid", async () => {
    status = 401;
    expect((await requireAccess(REQ(token()), deps()))!.status).toBe(401);
  });

  it.each([500, 503, 429, 418])("503 (closed) when Firestore answers %i", async (s) => {
    status = s;
    expect((await requireAccess(REQ(token()), deps()))!.status).toBe(503);
  });

  it("503 (closed) when Firestore cannot be reached", async () => {
    status = "network-error";
    expect((await requireAccess(REQ(token()), deps()))!.status).toBe(503);
  });

  it("503 when the project is not configured", async () => {
    const r = await requireAccess(REQ(token()), { ...deps(), projectId: "" });
    expect(r!.status).toBe(503);
    expect(urls).toEqual([]);
  });

  it("never lets anyone in when something unexpected happens", async () => {
    status = 204; // a surprising "success": only 200 counts
    expect((await requireAccess(REQ(token()), deps()))!.status).toBe(503);
  });
});

describe("requireAccess: remembering answers", () => {
  it("one lookup for a burst of requests with the same token", async () => {
    const t = token();
    for (let i = 0; i < 5; i++) expect(await requireAccess(REQ(t), deps())).toBeNull();
    expect(urls).toHaveLength(1);
  });

  it("asks again after a minute", async () => {
    const t = token();
    await requireAccess(REQ(t), deps());
    clock += 61_000;
    await requireAccess(REQ(t), deps());
    expect(urls).toHaveLength(2);
  });

  it("a removed person is out within a minute", async () => {
    const t = token();
    expect(await requireAccess(REQ(t), deps())).toBeNull();
    status = 404;
    clock += 61_000;
    expect((await requireAccess(REQ(t), deps()))!.status).toBe(403);
  });

  it("a refusal is remembered only briefly, so a newly added person gets in quickly", async () => {
    const t = token();
    status = 404;
    expect((await requireAccess(REQ(t), deps()))!.status).toBe(403);
    expect((await requireAccess(REQ(t), deps()))!.status).toBe(403);
    expect(urls).toHaveLength(1);
    status = 200;
    clock += 11_000;
    expect(await requireAccess(REQ(t), deps())).toBeNull();
  });

  it("does not remember a failure to reach the database", async () => {
    const t = token();
    status = "network-error";
    expect((await requireAccess(REQ(t), deps()))!.status).toBe(503);
    status = 200;
    expect(await requireAccess(REQ(t), deps())).toBeNull();
  });

  it("does not remember a refused token", async () => {
    const t = token();
    status = 401;
    await requireAccess(REQ(t), deps());
    status = 200;
    expect(await requireAccess(REQ(t), deps())).toBeNull();
  });

  it("answers are per token: somebody else's answer is never reused", async () => {
    expect(await requireAccess(REQ(token("a@example.com")), deps())).toBeNull();
    status = 404;
    expect((await requireAccess(REQ(token("b@example.com")), deps()))!.status).toBe(403);
    expect(urls).toHaveLength(2);
  });

  it("does not grow without limit", async () => {
    for (let i = 0; i < 700; i++) await requireAccess(REQ(token(`u${i}@example.com`)), deps());
    expect(urls).toHaveLength(700);
    // still works afterwards
    expect(await requireAccess(REQ(token("late@example.com")), deps())).toBeNull();
  });
});
