import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKUP_KEEP,
  DashboardSync,
  SCHEMA_VERSION,
  backupIdFor,
  backupsToPrune,
  ensureDailyBackup,
  firestoreBackups,
  stripUndefined,
  type DashboardBackend,
  type RemoteSnapshot,
  type SyncIssue,
  type SyncStatus,
} from "./dashboardSync";
import { fs } from "@/test/fakeFirestore";
import { dashboard, tab, widget } from "@/test/data";
import type { DashboardState } from "./rss";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));

// ── a fake backend we fully control ──────────────────────────────────────────
function setup(options?: ConstructorParameters<typeof DashboardSync>[2]) {
  let push!: (s: RemoteSnapshot) => void;
  let fail!: (e: unknown) => void;
  const writes: Record<string, any>[] = [];
  const writeResults: Array<"ok" | Error> = [];
  const backend: DashboardBackend = {
    subscribe(onSnap, onError) {
      push = onSnap;
      fail = onError;
      return () => {};
    },
    write: vi.fn(async (payload) => {
      writes.push(payload);
      const r = writeResults.shift() ?? "ok";
      if (r !== "ok") throw r;
    }),
  };
  const remote: Array<DashboardState | null> = [];
  const statuses: Array<[SyncStatus, SyncIssue | undefined]> = [];
  const confirmed: Array<DashboardState | null> = [];
  const sync = new DashboardSync(
    backend,
    {
      onRemote: (s) => remote.push(s),
      onStatus: (s, i) => statuses.push([s, i]),
      onConfirmed: (s) => confirmed.push(s),
    },
    options,
  );
  sync.start();
  return {
    sync,
    writes,
    writeResults,
    remote,
    statuses,
    confirmed,
    backend,
    push: (data: unknown, fromCache = false) =>
      push({ exists: data !== null, fromCache, data: data ?? undefined }),
    fail: (e: unknown) => fail(e),
    last: () => statuses[statuses.length - 1],
  };
}

const state = (name = "A") =>
  dashboard([tab("T1", [widget("w1", 0)])].map((t) => ({ ...t, name })));
const stored = (name = "A") => ({ ...state(name), schemaVersion: 1 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  fs.reset();
});

describe("rule 1: nothing is written before the server confirmed what is stored", () => {
  it("an empty answer from the local cache is NOT 'no data' (stays offline, edits refused)", async () => {
    const t = setup();
    t.push(null, true);
    expect(t.last()?.[0]).toBe("offline");
    expect(t.sync.canEdit()).toBe(false);
    expect(t.sync.schedule(state())).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.writes).toHaveLength(0);
    expect(t.remote).toHaveLength(0);
  });

  it("an answer from the server unlocks editing", () => {
    const t = setup();
    t.push(stored());
    expect(t.sync.canEdit()).toBe(true);
    expect(t.last()?.[0]).toBe("synced");
    expect(t.remote).toHaveLength(1);
  });

  it("after the server confirmed once, later cache answers are accepted", () => {
    const t = setup();
    t.push(stored("A"));
    t.push(stored("B"), true);
    expect(t.remote.map((s) => s?.tabs[0].name)).toEqual(["A", "B"]);
  });

  it("reports the first trustworthy read exactly once (daily backup hook)", () => {
    const t = setup();
    t.push(null, true);
    expect(t.confirmed).toHaveLength(0);
    t.push(stored("A"));
    t.push(stored("B"));
    expect(t.confirmed).toHaveLength(1);
    expect(t.confirmed[0]?.tabs[0].name).toBe("A");
  });
});

describe("rule 2: a missing document is never seeded automatically", () => {
  it("'does not exist' from the server → onRemote(null), and still no write", async () => {
    const t = setup();
    t.push(null);
    expect(t.remote).toEqual([null]);
    expect(t.confirmed).toEqual([null]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.writes).toHaveLength(0);
  });

  it("the first user edit does save", async () => {
    const t = setup();
    t.push(null);
    expect(t.sync.schedule(state("Mine"))).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.writes).toHaveLength(1);
  });
});

describe("rule 3: unreadable stored data is never overwritten", () => {
  it("blocks the sync and reports 'unreadable'", async () => {
    const t = setup();
    t.push({ tabs: "garbage" });
    expect(t.last()).toEqual(["error", "unreadable"]);
    expect(t.sync.canEdit()).toBe(false);
    expect(t.sync.schedule(state())).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.writes).toHaveLength(0);
    expect(t.remote).toHaveLength(0);
  });

  it("an explicit restore (force) may replace it, once the server has answered", async () => {
    const t = setup();
    t.push({ tabs: "garbage" });
    expect(t.sync.schedule(state("Restored"), { force: true })).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0].tabs[0].name).toBe("Restored");
    expect(t.sync.canEdit()).toBe(true);
  });

  it("force is refused before the server has answered", () => {
    const t = setup();
    expect(t.sync.schedule(state(), { force: true })).toBe(false);
    t.push(null, true);
    expect(t.sync.schedule(state(), { force: true })).toBe(false);
  });

  it("a listener error (e.g. permission denied) blocks and is reported", () => {
    const t = setup();
    t.fail({ code: "permission-denied" });
    expect(t.last()).toEqual(["error", "permission-denied"]);
    expect(t.sync.canEdit()).toBe(false);
    const t2 = setup();
    t2.fail(new Error("weird"));
    expect(t2.last()).toEqual(["error", "unknown"]);
  });
});

describe("saving", () => {
  it("waits for the debounce and merges quick edits into one write", async () => {
    const t = setup({ debounceMs: 400 });
    t.push(stored());
    t.sync.schedule(state("1"));
    await vi.advanceTimersByTimeAsync(200);
    t.sync.schedule(state("2"));
    await vi.advanceTimersByTimeAsync(200);
    t.sync.schedule(state("3"));
    expect(t.last()?.[0]).toBe("saving");
    expect(t.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0].tabs[0].name).toBe("3");
    expect(t.last()?.[0]).toBe("synced");
  });

  it("adds the schema version and removes undefined fields", async () => {
    const t = setup();
    t.push(stored());
    const s = state();
    s.tabs[0].defaultStyle = undefined;
    s.tabs[0].widgets[0].customTitle = undefined;
    t.sync.schedule(s);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.writes[0].schemaVersion).toBe(SCHEMA_VERSION);
    expect("defaultStyle" in t.writes[0].tabs[0]).toBe(false);
    expect("customTitle" in t.writes[0].tabs[0].widgets[0]).toBe(false);
  });

  it("our unsaved edits win over a snapshot arriving meanwhile", async () => {
    const t = setup();
    t.push(stored("server"));
    t.remote.length = 0;
    t.sync.schedule(state("mine"));
    t.push(stored("someone else"));
    expect(t.remote).toHaveLength(0); // not applied: would erase the edit
    await vi.advanceTimersByTimeAsync(500);
    expect(t.writes[0].tabs[0].name).toBe("mine");
  });

  it("flushNow saves immediately; stop({flush}) too", async () => {
    const t = setup();
    t.push(stored());
    t.sync.schedule(state("x"));
    t.sync.flushNow();
    expect(t.writes).toHaveLength(1);
    t.sync.schedule(state("y"));
    t.sync.stop({ flush: true });
    expect(t.writes).toHaveLength(2);
  });

  it("flushNow does nothing when there is nothing to save", () => {
    const t = setup();
    t.push(stored());
    t.sync.flushNow();
    expect(t.writes).toHaveLength(0);
  });

  it("after stop(), nothing more is saved or reported", async () => {
    const t = setup();
    t.push(stored());
    t.sync.schedule(state());
    t.sync.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.writes).toHaveLength(0);
    expect(t.sync.schedule(state())).toBe(false);
  });

  it("hasUnsavedChanges tells whether something is pending", async () => {
    const t = setup();
    t.push(stored());
    expect(t.sync.hasUnsavedChanges()).toBe(false);
    t.sync.schedule(state());
    expect(t.sync.hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.sync.hasUnsavedChanges()).toBe(false);
  });
});

describe("rule 4: failed saves are reported and retried, never silent", () => {
  it("keeps the change, reports it and retries with growing delays", async () => {
    const t = setup({ debounceMs: 100, retryDelaysMs: [1000, 5000] });
    t.push(stored());
    t.writeResults.push(new Error("net"), new Error("net"), "ok");
    t.sync.schedule(state("keep me"));
    await vi.advanceTimersByTimeAsync(100);
    expect(t.writes).toHaveLength(1);
    expect(t.last()).toEqual(["error", "write-failed"]);
    expect(t.sync.hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(999);
    expect(t.writes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.writes).toHaveLength(2); // retry after 1 s
    await vi.advanceTimersByTimeAsync(4999);
    expect(t.writes).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.writes).toHaveLength(3); // second retry after 5 s → succeeds
    expect(t.writes.every((w) => w.tabs[0].name === "keep me")).toBe(true);
    expect(t.last()?.[0]).toBe("synced");
    expect(t.sync.hasUnsavedChanges()).toBe(false);
  });

  it("reports permission-denied specifically", async () => {
    const t = setup({ debounceMs: 10 });
    t.push(stored());
    t.writeResults.push(Object.assign(new Error("denied"), { code: "permission-denied" }));
    t.sync.schedule(state());
    await vi.advanceTimersByTimeAsync(10);
    expect(t.last()).toEqual(["error", "permission-denied"]);
  });

  it("the last retry delay repeats", async () => {
    const t = setup({ debounceMs: 10, retryDelaysMs: [100] });
    t.push(stored());
    t.writeResults.push(new Error("a"), new Error("b"), new Error("c"), "ok");
    t.sync.schedule(state());
    await vi.advanceTimersByTimeAsync(10 + 100 + 100 + 100);
    expect(t.writes).toHaveLength(4);
  });
});

describe("stripUndefined", () => {
  it("removes undefined deeply (objects and arrays), keeps null / 0 / ''", () => {
    expect(
      stripUndefined({
        a: 1,
        b: undefined,
        c: { d: undefined, e: null, f: 0, g: "" },
        h: [1, undefined, { i: undefined }],
      }),
    ).toEqual({
      a: 1,
      c: { e: null, f: 0, g: "" },
      h: [1, {}],
    });
  });
  it("leaves primitives alone", () => {
    expect(stripUndefined(5)).toBe(5);
    expect(stripUndefined(null)).toBeNull();
    expect(stripUndefined(undefined)).toBeUndefined();
  });
});

describe("daily backups", () => {
  const uid = "u1";
  const when = new Date("2026-10-18T09:00:00Z");
  const full = state();

  it("backupIdFor is the UTC date", () => {
    expect(backupIdFor(new Date("2026-10-18T23:59:59Z"))).toBe("2026-10-18");
  });

  it("backupsToPrune keeps the 14 most recent and ignores foreign ids", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const prune = backupsToPrune([...ids, "junk", "2026-1-1"]);
    expect(new Set(prune)).toEqual(new Set(ids.slice(0, 6))); // the 6 oldest
    expect(prune).toHaveLength(20 - BACKUP_KEEP);
    expect(prune).not.toContain("junk");
    expect(backupsToPrune(ids.slice(0, 14))).toEqual([]);
  });

  it("takes one backup per day, the first time the app is opened", async () => {
    expect(await ensureDailyBackup({} as any, uid, full, when)).toBe(true);
    expect(fs.store.has("users/u1/backups/2026-10-18")).toBe(true);
    expect(await ensureDailyBackup({} as any, uid, state("changed later"), when)).toBe(false);
    expect(fs.store.get("users/u1/backups/2026-10-18").data.tabs[0].name).toBe("A"); // original kept
  });

  it("never backs up an empty dashboard (a wipe must not push good backups out)", async () => {
    expect(await ensureDailyBackup({} as any, uid, dashboard([tab("T")]), when)).toBe(false);
    expect(fs.store.size).toBe(0);
  });

  it("deletes the oldest backups beyond 14", async () => {
    for (let d = 1; d <= 16; d++)
      fs.store.set(`users/u1/backups/2026-09-${String(d).padStart(2, "0")}`, { data: full });
    await ensureDailyBackup({} as any, uid, full, when);
    expect(fs.deleted.sort()).toEqual([
      "users/u1/backups/2026-09-01",
      "users/u1/backups/2026-09-02",
      "users/u1/backups/2026-09-03",
    ]);
  });

  it("lists backups newest first and loads one (validated)", async () => {
    fs.store.set("users/u1/backups/2026-10-01", {
      tabCount: 1,
      feedCount: 2,
      bookmarkCount: 0,
      data: full,
    });
    fs.store.set("users/u1/backups/2026-10-05", {
      tabCount: 3,
      feedCount: 4,
      bookmarkCount: 5,
      data: full,
    });
    fs.store.set("users/u1/backups/not-a-date", { data: full });
    const api = firestoreBackups({} as any, uid);
    const list = await api.list();
    expect(list.map((b) => b.id)).toEqual(["2026-10-05", "2026-10-01"]);
    expect(list[0]).toMatchObject({ tabCount: 3, feedCount: 4, bookmarkCount: 5 });
    expect((await api.load("2026-10-01")).state.tabs[0].name).toBe("A");
    await expect(api.load("2020-01-01")).rejects.toThrow("no longer exists");
  });
});
