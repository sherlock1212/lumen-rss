// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useTheme } from "./useTheme";
import { THEMES, THEME_STORAGE_KEY, themeBootScript } from "./themeConfig";
import { fs, snap } from "@/test/fakeFirestore";
import { auth } from "@/test/fakeAuth";
import { mount } from "@/test/render";

vi.mock("firebase/firestore", () => import("@/test/fakeFirestore"));
vi.mock("./firebase", () => ({ db: {} }));
vi.mock("./useAuth", () => import("@/test/fakeAuth"));

let t: ReturnType<typeof useTheme>;
const C = () => ((t = useTheme()), null);
const attr = () => document.documentElement.getAttribute("data-theme");
const cached = () => localStorage.getItem(THEME_STORAGE_KEY);

beforeEach(() => {
  fs.reset();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  auth.user = { uid: "u1" };
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const open = async () => {
  mount(<C />);
  await act(async () => {});
};
const server = (theme: unknown) =>
  act(async () => fs.on("data/prefs").cb(snap(theme === null ? null : { theme })));

describe("useTheme", () => {
  it("starts from the theme remembered on this device (no flash of the default)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "cyber");
    await open();
    expect(t.theme).toBe("cyber");
    expect(attr()).toBe("cyber");
  });

  it("starts with Ember when nothing, or garbage, is remembered", async () => {
    await open();
    expect(t.theme).toBe("ember");
    document.body.innerHTML = "";
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    await open();
    expect(t.theme).toBe("ember");
  });

  it("the database answer wins and is remembered locally", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "cyber");
    await open();
    await server("daylight");
    expect(t.theme).toBe("daylight");
    expect(attr()).toBe("daylight");
    expect(cached()).toBe("daylight");
    expect(fs.sets).toHaveLength(0); // reading from the database never writes
  });

  it("an unknown theme in the database falls back to Ember", async () => {
    await open();
    await server("neon-pink");
    expect(t.theme).toBe("ember");
  });

  it("the removed Aurora theme, remembered locally or in the database, becomes Ember", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "aurora");
    await open();
    expect(t.theme).toBe("ember");
    await server("aurora");
    expect(t.theme).toBe("ember");
    expect(attr()).toBe("ember");
    expect(fs.sets).toHaveLength(0); // the stale value is not rewritten behind the user's back
  });

  it("a choice made by the user is applied, remembered and saved (merge)", async () => {
    await open();
    await server("ember");
    await act(async () => t.setTheme("slate"));
    expect(attr()).toBe("slate");
    expect(cached()).toBe("slate");
    expect(fs.sets).toHaveLength(1);
    expect(fs.sets[0]).toMatchObject({
      ref: "users/u1/data/prefs",
      data: { theme: "slate" },
      options: { merge: true },
    });
  });

  it("does not save before the database has answered", async () => {
    await open();
    await act(async () => t.setTheme("slate"));
    expect(fs.sets).toHaveLength(0);
    expect(attr()).toBe("slate");
  });

  it("signed out (or still checking): keeps the remembered theme, saves nothing", async () => {
    auth.user = null;
    localStorage.setItem(THEME_STORAGE_KEY, "slate");
    await open();
    expect(t.theme).toBe("slate");
    expect(fs.sets).toHaveLength(0);
    expect(fs.listeners).toHaveLength(0);
  });

  it("works when localStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await open();
    expect(t.theme).toBe("ember");
    await server("cyber");
    expect(t.theme).toBe("cyber");
  });
});

describe("themeBootScript (runs in the page head, before the first paint)", () => {
  const run = () => new Function(themeBootScript)();

  it("applies a remembered, valid theme", () => {
    for (const th of THEMES) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem(THEME_STORAGE_KEY, th.id);
      run();
      expect(attr()).toBe(th.id);
    }
  });

  it("ignores missing or invalid values", () => {
    run();
    expect(attr()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, 'x"><script>alert(1)</script>');
    run();
    expect(attr()).toBeNull();
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });

  it("is small and has no external dependencies", () => {
    expect(themeBootScript.length).toBeLessThan(400);
  });
});
