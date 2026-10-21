// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useDashboard } from "./useDashboard";
import { fs, snap } from "@/test/fakeFirestore";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";
import type { DashboardState } from "./rss";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./useAuth", () => import("@/test/fakeAuth"));

let d: ReturnType<typeof useDashboard>;
let statuses: string[];
const C = () => ((d = useDashboard()), statuses.push(d.sync.status), null);

const stored = (active: string, tabIds = ["T1", "T2"], extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  tabs: tabIds.map((id) => ({
    id,
    name: id,
    columns: 3,
    widgets:
      id === "T1"
        ? [
            { id: "w1", url: "https://a.example/rss", column: 0 },
            { id: "w2", url: "https://b.example/rss", column: 0 },
          ]
        : [],
  })),
  activeTabId: active,
  globalDefaultStyle: "full",
  highlightNew: true,
  ...extra,
});
const KEY = "lumen:activeTab:u1";
const dash = () => fs.on("data/dashboard");
const server = (data: unknown, fromCache = false) =>
  act(async () => dash().cb(snap(data, fromCache)));
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const open = async () => {
  mount(<C />);
  await act(async () => {});
};
const dashWrites = () => fs.sets.filter((s) => s.ref.endsWith("data/dashboard"));

beforeEach(() => {
  vi.useFakeTimers();
  fs.reset();
  localStorage.clear();
  statuses = [];
  auth.user = { uid: "u1" };
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("loading and safety", () => {
  it("shows a starter dashboard in memory only: nothing is written on load", async () => {
    await open();
    await server(null); // the server says: no dashboard yet
    expect(d.state.tabs[0].widgets.length).toBeGreaterThan(0);
    await wait(5000);
    expect(dashWrites()).toHaveLength(0);
  });

  it("ignores edits until the server has answered (offline / cache only)", async () => {
    await open();
    await server(null, true);
    const before = d.state.tabs[0].name;
    await act(async () => d.renameTab(d.state.tabs[0].id, "Hacked"));
    await wait(5000);
    expect(d.state.tabs[0].name).toBe(before); // the edit is refused, not shown and lost
    expect(dashWrites()).toHaveLength(0);
    expect(d.sync.status).toBe("offline");
  });

  it("does not overwrite a stored dashboard it cannot read", async () => {
    await open();
    await server({ tabs: "garbage" });
    expect(d.sync).toMatchObject({ status: "error", issue: "unreadable" });
    const tabs = d.state.tabs.length;
    await act(async () => d.addTab("X"));
    await wait(5000);
    expect(d.state.tabs).toHaveLength(tabs);
    expect(dashWrites()).toHaveLength(0);
  });

  it("signed out: empty local dashboard, nothing saved, no subscription", async () => {
    auth.user = null;
    await open();
    expect(d.sync.status).toBe("loading");
    await act(async () => d.addTab("Local"));
    await wait(5000);
    expect(fs.sets).toHaveLength(0);
    expect(fs.listeners).toHaveLength(0);
  });

  it("takes a daily backup of the dashboard found at the first confirmed read", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => {});
    expect([...fs.store.keys()].some((k) => k.startsWith("users/u1/backups/"))).toBe(true);
  });
});

describe("switching tab never touches the database", () => {
  it("the tab remembered on this device wins over the saved one, with no write", async () => {
    localStorage.setItem(KEY, "T2");
    await open();
    await server(stored("T1"));
    expect(d.state.activeTabId).toBe("T2");
    expect(dashWrites()).toHaveLength(0);
  });

  it("switching: updates the view and the local memory, writes nothing, never shows 'saving'", async () => {
    await open();
    await server(stored("T1"));
    const mark = statuses.length;
    await act(async () => d.setActiveTab("T2"));
    await wait(1000);
    expect(d.state.activeTabId).toBe("T2");
    expect(localStorage.getItem(KEY)).toBe("T2");
    expect(dashWrites()).toHaveLength(0);
    expect(statuses.slice(mark)).not.toContain("saving");
  });

  it("an unknown tab id is ignored", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.setActiveTab("nope"));
    expect(d.state.activeTabId).toBe("T1");
  });

  it("a later server snapshot does not throw us back to the saved tab", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.setActiveTab("T2"));
    await server(stored("T1"));
    expect(d.state.activeTabId).toBe("T2");
  });

  it("falls back to the saved tab if the open one was deleted elsewhere", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.setActiveTab("T2"));
    await server(stored("T1", ["T1", "T3"]));
    expect(d.state.activeTabId).toBe("T1");
  });

  it("a real edit still saves, carrying the tab that is open", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.setActiveTab("T2"));
    await act(async () => d.renameTab("T1", "Renamed"));
    await wait(700);
    expect(dashWrites()).toHaveLength(1);
    expect(dashWrites()[0].data.tabs[0].name).toBe("Renamed");
    expect(dashWrites()[0].data.activeTabId).toBe("T2");
  });

  it("adding a tab switches to it, remembers it and saves once", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.addTab("New"));
    const id = d.state.activeTabId;
    await wait(700);
    expect(id).not.toBe("T1");
    expect(localStorage.getItem(KEY)).toBe(id);
    expect(dashWrites()).toHaveLength(1);
  });

  it("removing the open tab moves to another one (but never removes the last tab)", async () => {
    await open();
    await server(stored("T1"));
    await act(async () => d.removeTab("T1"));
    expect(d.state.tabs.map((t) => t.id)).toEqual(["T2"]);
    expect(d.state.activeTabId).toBe("T2");
    expect(localStorage.getItem(KEY)).toBe("T2");
    await act(async () => d.removeTab("T2"));
    expect(d.state.tabs).toHaveLength(1);
  });
});

describe("edits", () => {
  const widgets = () => d.state.tabs.find((t) => t.id === d.state.activeTabId)!.widgets;
  const loaded = async () => {
    await open();
    await server(stored("T1"));
  };

  it("several quick edits are saved as ONE write", async () => {
    await loaded();
    await act(async () => d.addWidget("https://c.example/rss"));
    await act(async () => d.updateWidget("w1", { customTitle: "Mine" }));
    await act(async () => d.setHighlightNew(false));
    await wait(700);
    expect(dashWrites()).toHaveLength(1);
    expect(dashWrites()[0].data.highlightNew).toBe(false);
  });

  it("a new feed goes to the shortest column", async () => {
    await loaded(); // column 0 has two tiles, 1 and 2 are empty
    await act(async () => d.addWidget("https://c.example/rss"));
    expect(widgets().find((w) => w.url === "https://c.example/rss")!.column).toBe(1);
  });

  it("removes and updates tiles", async () => {
    await loaded();
    await act(async () => d.removeWidget("w1"));
    expect(widgets().map((w) => w.id)).toEqual(["w2"]);
    await act(async () => d.updateWidget("w2", { style: "mini" }));
    expect(widgets()[0].style).toBe("mini");
  });

  it("drag & drop: moving a tile saves; dropping it where it was does NOT save", async () => {
    await loaded();
    await act(async () => d.reorderWidgets("w1", 0, 0)); // already first in column 0
    await wait(700);
    expect(dashWrites()).toHaveLength(0);
    await act(async () => d.reorderWidgets("w1", 2, 0));
    await wait(700);
    expect(widgets().find((w) => w.id === "w1")!.column).toBe(2);
    expect(dashWrites()).toHaveLength(1);
  });

  it("changing the number of columns keeps every tile; same number = no save", async () => {
    await loaded();
    await act(async () => d.setColumns(3));
    await wait(700);
    expect(dashWrites()).toHaveLength(0);
    await act(async () => d.setColumns(4));
    await act(async () => d.reorderWidgets("w2", 3, 0));
    await act(async () => d.setColumns(2));
    expect(d.state.tabs[0].columns).toBe(2);
    expect(
      widgets()
        .map((w) => w.id)
        .sort(),
    ).toEqual(["w1", "w2"]);
    expect(widgets().every((w) => w.column < 2)).toBe(true);
  });

  it("importing tabs adds them and switches to the first imported", async () => {
    await loaded();
    await act(async () => d.importTabs([{ id: "I1", name: "Imp", columns: 3, widgets: [] }]));
    expect(d.state.tabs.map((t) => t.id)).toEqual(["T1", "T2", "I1"]);
    expect(d.state.activeTabId).toBe("I1");
    await act(async () => d.importTabs([]));
    expect(d.state.tabs).toHaveLength(3);
  });

  it("restoring a backup replaces everything and is saved (also over unreadable data)", async () => {
    await open();
    await server({ tabs: "garbage" });
    const restored: DashboardState = {
      tabs: [{ id: "R", name: "R", columns: 2, widgets: [] }],
      activeTabId: "R",
      globalDefaultStyle: "full",
      highlightNew: true,
    };
    await act(async () => d.replaceState(restored));
    await wait(700);
    expect(d.state.tabs.map((t) => t.id)).toEqual(["R"]);
    expect(dashWrites()).toHaveLength(1);
    expect(localStorage.getItem(KEY)).toBe("R");
  });

  it("styles resolve tile → tab → global", async () => {
    await loaded();
    const w = widgets()[0];
    expect(d.resolveStyle(w)).toBe("full");
    await act(async () => d.setGlobalStyle("compact"));
    expect(d.resolveStyle(widgets()[0])).toBe("compact");
    await act(async () => d.setTabStyle("mini"));
    expect(d.resolveStyle(widgets()[0])).toBe("mini");
    await act(async () => d.updateWidget("w1", { style: "condensed" }));
    expect(d.resolveStyle(widgets()[0])).toBe("condensed");
  });
});
