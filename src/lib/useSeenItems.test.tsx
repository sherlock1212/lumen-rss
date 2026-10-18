// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useSeenItems } from "./useSeenItems";
import { fs, snap } from "@/test/fakeFirestore";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./useAuth", () => import("@/test/fakeAuth"));

const FEED = "https://f.example/rss";
let seen: ReturnType<typeof useSeenItems>;
const C = ({ url = FEED }: { url?: string }) => ((seen = useSeenItems(url)), null);
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  auth.user = { uid: `seen-${++n}` };
  fs.reset();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const open = async () => {
  mount(<C />);
  await act(async () => {});
};
const server = (map: Record<string, string[]> | null, fromCache = false) =>
  act(async () => fs.on("data/seen").cb(snap(map === null ? null : { map }, fromCache)));
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const urls = (...ids: string[]) => ids.map((i) => `https://f.example/${i}`);

describe("useSeenItems: what is new, and when it costs a write", () => {
  it("flags entries that were not in the previous list", async () => {
    await open();
    await server({ [FEED]: urls("a", "b") });
    const fresh = seen.computeNew(urls("c", "a", "b"));
    expect([...fresh]).toEqual(urls("c"));
  });

  it("flags nothing the first time a feed is seen (no baseline yet)", async () => {
    await open();
    await server({});
    expect(seen.computeNew(urls("a", "b")).size).toBe(0);
    await wait(1600);
    expect(fs.sets).toHaveLength(1); // first time: the baseline is saved
    expect(fs.sets[0].data.map[FEED]).toEqual(urls("a", "b"));
  });

  it("refresh with the same entries costs NO write (even if reordered)", async () => {
    await open();
    await server({ [FEED]: urls("a", "b", "c") });
    expect(seen.computeNew(urls("a", "b", "c")).size).toBe(0);
    expect(seen.computeNew(urls("c", "b", "a")).size).toBe(0);
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
  });

  it("a real change is saved once, after the debounce", async () => {
    await open();
    await server({ [FEED]: urls("a", "b") });
    seen.computeNew(urls("c", "a"));
    seen.computeNew(urls("d", "c", "a"));
    await wait(1600);
    expect(fs.sets).toHaveLength(1);
    expect(fs.sets[0].data.map[FEED]).toEqual(urls("d", "c", "a"));
  });

  it("repeating the same list after saving writes nothing more", async () => {
    await open();
    await server({ [FEED]: urls("a") });
    seen.computeNew(urls("b", "a"));
    await wait(1600);
    fs.sets.length = 0;
    seen.computeNew(urls("b", "a"));
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
  });

  it("a snapshot arriving before our save does not undo the local change", async () => {
    await open();
    await server({ [FEED]: urls("a") });
    seen.computeNew(urls("b", "a")); // local, unsaved
    await server({ [FEED]: urls("a") }); // stale echo from the server
    await wait(1600);
    expect(fs.sets[0].data.map[FEED]).toEqual(urls("b", "a"));
  });

  it("keeps other feeds' lists untouched when one feed changes", async () => {
    await open();
    await server({ [FEED]: urls("a"), "https://other.example/rss": ["https://o.example/1"] });
    seen.computeNew(urls("b", "a"));
    await wait(1600);
    expect(fs.sets[0].data.map["https://other.example/rss"]).toEqual(["https://o.example/1"]);
  });

  it("never flags or writes before the server answered", async () => {
    await open();
    expect(seen.computeNew(urls("a")).size).toBe(0);
    await server(null, true); // empty local cache is not 'nothing saved'
    expect(seen.computeNew(urls("a", "b")).size).toBe(0);
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
  });

  it("guests: nothing is flagged and nothing is saved", async () => {
    auth.user = null;
    await open();
    expect(seen.computeNew(urls("a")).size).toBe(0);
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
  });

  it("keeps at most 300 entries per feed", async () => {
    await open();
    await server({ [FEED]: ["https://f.example/old"] });
    seen.computeNew(Array.from({ length: 500 }, (_, i) => `https://f.example/${i}`));
    await wait(1600);
    expect(fs.sets[0].data.map[FEED]).toHaveLength(300);
  });
});
