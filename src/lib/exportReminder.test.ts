// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXPORT_INTERVAL_DAYS,
  SNOOZE_DAYS,
  parseExportDate,
  readSnooze,
  reminderStatus,
  snoozeUntil,
  writeSnooze,
} from "./exportReminder";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 18, 12, 0, 0);

afterEach(() => localStorage.clear());

describe("reminderStatus", () => {
  it("is due when there has never been an export", () => {
    expect(reminderStatus({ lastExportAt: null, snoozedUntil: null, now })).toEqual({
      daysSince: null,
      due: true,
    });
  });

  it("is not due before 30 days, due from 30 days", () => {
    const at = (days: number) => new Date(now - days * DAY);
    expect(reminderStatus({ lastExportAt: at(29), snoozedUntil: null, now }).due).toBe(false);
    expect(
      reminderStatus({ lastExportAt: at(EXPORT_INTERVAL_DAYS), snoozedUntil: null, now }).due,
    ).toBe(true);
    expect(reminderStatus({ lastExportAt: at(45), snoozedUntil: null, now })).toMatchObject({
      daysSince: 45,
      due: true,
    });
  });

  it("stays quiet while snoozed, then comes back", () => {
    const old = new Date(now - 60 * DAY);
    expect(reminderStatus({ lastExportAt: old, snoozedUntil: now + DAY, now }).due).toBe(false);
    expect(reminderStatus({ lastExportAt: old, snoozedUntil: now - 1, now }).due).toBe(true);
  });

  it("treats a date in the future (wrong clock) as 'just exported'", () => {
    const r = reminderStatus({ lastExportAt: new Date(now + 10 * DAY), snoozedUntil: null, now });
    expect(r).toEqual({ daysSince: 0, due: false });
  });
});

describe("parseExportDate", () => {
  it("accepts ISO strings only", () => {
    expect(parseExportDate("2026-10-01T10:00:00.000Z")?.toISOString()).toBe(
      "2026-10-01T10:00:00.000Z",
    );
    expect(parseExportDate("not a date")).toBeNull();
    expect(parseExportDate(undefined)).toBeNull();
    expect(parseExportDate(12345)).toBeNull();
    expect(parseExportDate(null)).toBeNull();
  });
});

describe("snooze", () => {
  it("lasts 7 days", () => {
    expect(snoozeUntil(now)).toBe(now + SNOOZE_DAYS * DAY);
  });

  it("is stored per user on this device", () => {
    expect(readSnooze("u1")).toBeNull();
    writeSnooze("u1", 123);
    expect(readSnooze("u1")).toBe(123);
    expect(readSnooze("u2")).toBeNull();
  });

  it("ignores garbage and blocked storage", () => {
    localStorage.setItem("lumen:exportReminderSnooze:u1", "abc");
    expect(readSnooze("u1")).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSnooze("u1")).toBeNull();
  });
});
