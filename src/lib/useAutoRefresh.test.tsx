// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { REFRESH_MS, hashStr, refreshDue, useAutoRefresh } from "./useAutoRefresh";
import { mount } from "@/test/render";

const due = (o: Partial<Parameters<typeof refreshDue>[0]> = {}) =>
  refreshDue({
    hidden: false,
    fetching: false,
    now: 1_000_000,
    lastUpdated: 0,
    intervalMs: 1000,
    jitterMs: 0,
    ...o,
  });

describe("refreshDue", () => {
  it("is due once the data is older than interval + jitter", () => {
    expect(due({ now: 999 })).toBe(false);
    expect(due({ now: 1000 })).toBe(true);
    expect(due({ now: 1500, jitterMs: 600 })).toBe(false);
    expect(due({ now: 1600, jitterMs: 600 })).toBe(true);
  });
  it("never refreshes a hidden page or while already fetching", () => {
    expect(due({ hidden: true })).toBe(false);
    expect(due({ fetching: true })).toBe(false);
  });
});

describe("hashStr", () => {
  it("is stable and non-negative", () => {
    expect(hashStr("abc")).toBe(hashStr("abc"));
    expect(hashStr("widget-1")).toBeGreaterThanOrEqual(0);
    expect(hashStr("")).toBe(0);
  });
  it("spreads different ids", () => {
    const set = new Set(Array.from({ length: 50 }, (_, i) => hashStr(`w-${i}`) % 120_000));
    expect(set.size).toBeGreaterThan(40);
  });
});

describe("useAutoRefresh", () => {
  let refetch: ReturnType<typeof vi.fn<() => void>>;
  let props: { lastUpdated: number; fetching: boolean };
  const C = () => (
    useAutoRefresh({ id: "w1", ...props, refetch, intervalMs: 100_000, tickMs: 1000 }),
    null
  );
  const setHidden = (hidden: boolean) =>
    Object.defineProperty(document, "visibilityState", {
      value: hidden ? "hidden" : "visible",
      configurable: true,
    });
  const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    refetch = vi.fn();
    props = { lastUpdated: Date.now(), fetching: false };
    setHidden(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("default interval is 10 minutes", () => expect(REFRESH_MS).toBe(600_000));

  it("does nothing while the data is fresh", async () => {
    mount(<C />);
    await wait(60_000);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("refreshes once the data is old enough (within interval + 20% jitter)", async () => {
    mount(<C />);
    await wait(99_000);
    expect(refetch).not.toHaveBeenCalled();
    await wait(25_000); // 124 s > 100 s + max 20 s of jitter
    expect(refetch).toHaveBeenCalled();
  });

  it("pauses while the page is hidden and catches up when it is shown again", async () => {
    mount(<C />);
    setHidden(true);
    await wait(300_000);
    expect(refetch).not.toHaveBeenCalled();
    setHidden(false);
    await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not stack requests while one is running", async () => {
    props.fetching = true;
    const m = mount(<C />);
    await wait(300_000);
    expect(refetch).not.toHaveBeenCalled();
    props = { lastUpdated: Date.now(), fetching: false };
    await m.rerender(<C />);
    await wait(10_000);
    expect(refetch).not.toHaveBeenCalled(); // fresh again
  });

  it("stops everything on unmount", async () => {
    const m = mount(<C />);
    await m.unmount();
    await wait(600_000);
    setHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refetch).not.toHaveBeenCalled();
  });
});
