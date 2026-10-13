// Monthly reminder to download a full JSON backup.
//
// "Last export" is stored per user in Firestore (users/{uid}/data/meta), so it is
// the same on every device and never mixes up accounts. It is recorded only when a
// full JSON backup is actually downloaded from Lumen (the OPML export and the
// automatic safety copy made before a restore do not count).
//
// "Remind me later" is a per-device convenience kept in localStorage, per user.

export const EXPORT_INTERVAL_DAYS = 30;
export const SNOOZE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderStatus {
  /** Whole days since the last export; null if none is recorded. */
  daysSince: number | null;
  /** True when the reminder should be shown. */
  due: boolean;
}

export function reminderStatus(opts: {
  lastExportAt: Date | null;
  /** Epoch ms until which the reminder is snoozed on this device. */
  snoozedUntil: number | null;
  now?: number;
}): ReminderStatus {
  const now = opts.now ?? Date.now();
  const last = opts.lastExportAt?.getTime() ?? null;
  const daysSince = last === null ? null : Math.max(0, Math.floor((now - last) / DAY_MS));

  // A date in the future (wrong clock on some device) counts as "just exported".
  const overdue = last === null || now - last >= EXPORT_INTERVAL_DAYS * DAY_MS;
  const snoozed = opts.snoozedUntil !== null && now < opts.snoozedUntil;
  return { daysSince, due: overdue && !snoozed };
}

/** Parses the stored value; anything that is not a valid date means "never". */
export function parseExportDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function snoozeUntil(now = Date.now()): number {
  return now + SNOOZE_DAYS * DAY_MS;
}

// ── Per-device snooze storage ────────────────────────────────────────────────

const snoozeKey = (uid: string) => `lumen:exportReminderSnooze:${uid}`;

export function readSnooze(uid: string): number | null {
  try {
    const raw = window.localStorage.getItem(snoozeKey(uid));
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null; // storage blocked or unavailable: the reminder just won't be snoozable
  }
}

export function writeSnooze(uid: string, until: number) {
  try {
    window.localStorage.setItem(snoozeKey(uid), String(until));
  } catch {
    /* ignore */
  }
}
