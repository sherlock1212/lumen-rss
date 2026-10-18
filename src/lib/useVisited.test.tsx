// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useVisited } from "./useVisited";
import { linkId } from "./linkId";
import { fs, snap } from "@/test/fakeFirestore";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./useAuth", () => import("@/test/fakeAuth"));

let a: ReturnType<typeof useVisited>;
let b: ReturnType<typeof useVisited>;
const A = () => ((a = useVisited()), (<p id="a">{String(a.isVisited("https://x.example/1"))}</p>));
const B = () => ((b = useVisited()), (<p id="b">{String(b.isVisited("https://x.example/1"))}</p>));
const text = (id: string) => document.getElementById(id)!.textContent;
let n = 0;

beforeEach(() => {
  vi.useFakeTimers();
  auth.user = { uid: `visited-${++n}` }; // a new user = fresh store
  fs.reset();
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide")); // settle pending saves so tests stay independent
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const open = async () => {
  const m = mount(
    <>
      <A />
      <B />
    </>,
  );
  await act(async () => {});
  return m;
};
const server = (links: string[] | null, fromCache = false) =>
  act(async () => fs.on("data/visited").cb(snap(links === null ? null : { links }, fromCache)));
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("useVisited", () => {
  it("two cards share one single Firestore subscription", async () => {
    await open();
    expect(fs.listeners.filter((l) => l.ref.endsWith("data/visited"))).toHaveLength(1);
  });

  it("a click in one card is immediately visible in the other", async () => {
    await open();
    await server([]);
    await act(async () => a.markVisited("https://x.example/1"));
    expect(text("a")).toBe("true");
    expect(text("b")).toBe("true");
  });

  it("A and B clicks inside the debounce window cost ONE write", async () => {
    await open();
    await server([]);
    await act(async () => a.markVisited("https://x.example/1"));
    await act(async () => b.markVisited("https://x.example/2"));
    await wait(1600);
    expect(fs.sets).toHaveLength(1);
    expect(fs.sets[0].data.links).toHaveLength(2);
  });

  it("stores compact ids instead of full addresses", async () => {
    await open();
    await server([]);
    await act(async () => a.markVisited("https://x.example/some/very/long/address?with=query"));
    await wait(1600);
    expect(fs.sets[0].data.links).toEqual([
      linkId("https://x.example/some/very/long/address?with=query"),
    ]);
    expect(fs.sets[0].data.links.every((l: string) => !/[:/]/.test(l))).toBe(true);
  });

  it("understands links saved in the old format (full addresses) and the new one", async () => {
    await open();
    await server(["https://x.example/1", linkId("https://x.example/2")]);
    expect(a.isVisited("https://x.example/1")).toBe(true);
    expect(a.isVisited("https://x.example/2")).toBe(true);
    expect(a.isVisited("https://x.example/3")).toBe(false);
  });

  it("marking the same link twice does not write twice", async () => {
    await open();
    await server([]);
    await act(async () => a.markVisited("https://x.example/1"));
    await wait(1600);
    fs.sets.length = 0;
    await act(async () => a.markVisited("https://x.example/1"));
    await wait(1600);
    expect(fs.sets).toHaveLength(0);
  });

  it("ignores an empty answer from the local cache and keeps clicks made before the server answered", async () => {
    await open();
    await server(null, true); // cache: nothing yet
    await act(async () => a.markVisited("https://x.example/early"));
    await wait(5000);
    expect(fs.sets).toHaveLength(0); // still nothing written: the real list is not known yet
    await server(["https://x.example/old"]); // the server answers
    expect(a.isVisited("https://x.example/early")).toBe(true);
    expect(a.isVisited("https://x.example/old")).toBe(true);
    await wait(1600);
    expect(fs.sets).toHaveLength(1); // the early click is saved after the load
    expect(fs.sets[0].data.links).toHaveLength(2);
  });

  it("never writes before the server answered", async () => {
    await open();
    await act(async () => a.markVisited("https://x.example/1"));
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
  });

  it("flushes pending marks when the page is hidden", async () => {
    await open();
    await server([]);
    await act(async () => a.markVisited("https://x.example/1"));
    await act(async () => void window.dispatchEvent(new Event("pagehide")));
    expect(fs.sets).toHaveLength(1);
  });

  it("guests: marks live in memory only, nothing is saved", async () => {
    auth.user = null;
    await open();
    await act(async () => a.markVisited("https://x.example/1"));
    expect(text("a")).toBe("true");
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
    expect(fs.listeners).toHaveLength(0);
  });

  it("keeps the list bounded (5000)", async () => {
    await open();
    await server([]);
    await act(async () => {
      for (let i = 0; i < 5200; i++) a.markVisited(`https://x.example/p/${i}`);
    });
    await wait(1600);
    expect(fs.sets[0].data.links.length).toBeLessThanOrEqual(5000);
    expect(fs.sets[0].data.links).toContain(linkId("https://x.example/p/5199")); // newest kept
  });
});
