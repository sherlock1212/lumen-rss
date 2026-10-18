// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readActiveTab, withActiveTab, writeActiveTab } from "./activeTab";
import { dashboard, tab } from "@/test/data";

afterEach(() => localStorage.clear());

describe("active tab memory (per device, per user)", () => {
  it("writes and reads back", () => {
    expect(readActiveTab("u1")).toBeNull();
    writeActiveTab("u1", "T2");
    expect(readActiveTab("u1")).toBe("T2");
  });

  it("keeps users apart", () => {
    writeActiveTab("u1", "T1");
    writeActiveTab("u2", "T9");
    expect(readActiveTab("u1")).toBe("T1");
    expect(readActiveTab("u2")).toBe("T9");
  });

  it("does not throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readActiveTab("u1")).toBeNull();
    expect(() => writeActiveTab("u1", "T1")).not.toThrow();
  });
});

describe("withActiveTab", () => {
  const state = dashboard([tab("T1"), tab("T2"), tab("T3")], "T1");

  it("uses the first preferred id that still exists", () => {
    expect(withActiveTab(state, ["gone", "T3", "T2"]).activeTabId).toBe("T3");
  });

  it("ignores null / undefined / empty", () => {
    expect(withActiveTab(state, [null, undefined, "", "T2"]).activeTabId).toBe("T2");
  });

  it("returns the same object when nothing changes", () => {
    expect(withActiveTab(state, ["T1"])).toBe(state);
    expect(withActiveTab(state, ["gone"])).toBe(state);
    expect(withActiveTab(state, [])).toBe(state);
  });

  it("does not modify the original state", () => {
    withActiveTab(state, ["T3"]);
    expect(state.activeTabId).toBe("T1");
  });
});
