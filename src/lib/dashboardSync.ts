// Keeps the dashboard in sync with Firestore — safely.
//
// The rules this module enforces (each one exists because the previous code
// broke it and could wipe a user's data):
//
//  1. NOTHING is written until the server has confirmed what is stored.
//     When the client is offline / blocked / slow at page load, Firestore reports
//     "this document does not exist" from its empty local cache. That answer is
//     ignored here (`fromCache`), instead of being mistaken for a new account.
//  2. A missing document is never "seeded" automatically. The starter dashboard
//     is shown in memory only, and saved the first time the user changes something.
//  3. A document that exists but cannot be understood is never overwritten
//     (the sync is blocked, the user is told, and can restore a backup).
//  4. Failed saves are retried and reported; they are never silent.
//
// The class below knows nothing about React or Firestore, so it can be tested
// with a fake backend (see DashboardBackend).

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
} from "firebase/firestore";
import { normalizeDashboardState, summarizeState, type ParsedBackup } from "./backup";
import type { DashboardState } from "./rss";

export const SCHEMA_VERSION = 1;

export type SyncStatus =
  | "guest" //   not signed in: nothing is saved
  | "loading" // waiting for the first answer from the server
  | "offline" // server not reachable: editing paused, nothing will be overwritten
  | "synced" //  everything is saved
  | "saving" //  local changes not yet confirmed by the server
  | "error"; //  see `issue`

/** Machine-readable reason attached to status "error" / "offline". */
export type SyncIssue =
  | "unreadable" //          the stored dashboard exists but is not valid
  | "permission-denied" //   Firestore security rules rejected the request
  | "write-failed" //        a save failed (will be retried)
  | "unknown";

export interface RemoteSnapshot {
  exists: boolean;
  /** true when the answer comes from the local cache, not from the server */
  fromCache: boolean;
  data: unknown;
}

export interface DashboardBackend {
  subscribe(onSnap: (s: RemoteSnapshot) => void, onError: (e: unknown) => void): () => void;
  write(payload: Record<string, unknown>): Promise<void>;
}

export interface SyncEvents {
  /** New state from the server. `null` = the server says nothing is saved yet. */
  onRemote(state: DashboardState | null): void;
  onStatus(status: SyncStatus, issue?: SyncIssue): void;
  /** Called once, on the first trustworthy read (used to take the daily backup). */
  onConfirmed?(state: DashboardState | null): void;
}

export interface SyncOptions {
  debounceMs?: number;
  /** Delays between retries after a failed save; the last value repeats. */
  retryDelaysMs?: number[];
}

/**
 * Firestore rejects `undefined`. Removing it is also the right way to "clear" a
 * field, because every save replaces the whole document.
 */
export function stripUndefined<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.filter((v) => v !== undefined).map(stripUndefined) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v !== undefined) out[k] = stripUndefined(v);
  }
  return out as T;
}

function issueFrom(e: unknown): SyncIssue {
  const code = (e as { code?: string } | null)?.code;
  return code === "permission-denied" ? "permission-denied" : "unknown";
}

export class DashboardSync {
  private unsub: (() => void) | null = null;
  private status: SyncStatus = "loading";
  private confirmed = false; //   the server has told us what is stored
  private blocked = false; //     stored data unreadable / access denied: no automatic writes
  private dirty = false; //       local change not yet handed to Firestore
  private inflight = 0; //        writes handed to Firestore, not yet acknowledged
  private failures = 0;
  private latest: DashboardState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private reportedConfirmed = false;
  private readonly debounceMs: number;
  private readonly retryDelaysMs: number[];

  constructor(
    private readonly backend: DashboardBackend,
    private readonly events: SyncEvents,
    options: SyncOptions = {},
  ) {
    this.debounceMs = options.debounceMs ?? 400;
    this.retryDelaysMs = options.retryDelaysMs ?? [3000, 10000, 30000];
  }

  start() {
    this.unsub = this.backend.subscribe(
      (s) => this.handleSnapshot(s),
      (e) => this.handleListenError(e),
    );
  }

  /** Stops listening. With `flush`, hands any unsaved change to Firestore first. */
  stop(opts: { flush?: boolean } = {}) {
    if (opts.flush && this.dirty && this.confirmed) this.flush();
    this.stopped = true;
    this.clearTimer();
    this.unsub?.();
    this.unsub = null;
  }

  /** Normal edits are allowed only once the stored data is known and readable. */
  canEdit(): boolean {
    return this.confirmed && !this.blocked && !this.stopped;
  }

  hasUnsavedChanges(): boolean {
    return this.dirty || this.inflight > 0;
  }

  /**
   * Queues `state` to be saved. Returns false (and does nothing) if saving is not
   * safe right now. `force` is for an explicit user decision to replace the stored
   * dashboard (restore from backup); it still requires a server-confirmed read.
   */
  schedule(state: DashboardState, opts: { force?: boolean } = {}): boolean {
    if (this.stopped) return false;
    if (opts.force) {
      if (!this.confirmed) return false;
      this.blocked = false;
    } else if (!this.canEdit()) {
      return false;
    }
    this.latest = state;
    this.dirty = true;
    this.setStatus("saving");
    this.arm(this.debounceMs);
    return true;
  }

  /** Saves immediately instead of waiting for the debounce (e.g. tab being hidden). */
  flushNow() {
    if (this.dirty && this.confirmed && !this.blocked && !this.stopped) this.flush();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private setStatus(status: SyncStatus, issue?: SyncIssue) {
    if (this.stopped) return;
    this.status = status;
    this.events.onStatus(status, issue);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number) {
    this.clearTimer();
    this.timer = setTimeout(() => this.flush(), ms);
  }

  private handleSnapshot(s: RemoteSnapshot) {
    if (this.stopped) return;

    if (s.fromCache && !this.confirmed) {
      // Rule 1: an answer from the local cache, before the server has ever
      // answered, proves nothing. An empty cache looks exactly like "no document".
      this.setStatus("offline");
      return;
    }
    if (!s.fromCache) this.confirmed = true;
    if (!this.confirmed) return;

    // Our own unsaved edits win over whatever the server shows right now.
    if (this.dirty || this.inflight > 0) return;

    let state: DashboardState | null = null;
    if (s.exists) {
      try {
        state = normalizeDashboardState(s.data).state;
      } catch {
        // Rule 3: never overwrite what we cannot read.
        this.blocked = true;
        this.setStatus("error", "unreadable");
        return;
      }
    }

    this.blocked = false;
    this.events.onRemote(state);
    this.setStatus("synced");
    if (!this.reportedConfirmed) {
      this.reportedConfirmed = true;
      this.events.onConfirmed?.(state);
    }
  }

  private handleListenError(e: unknown) {
    if (this.stopped) return;
    this.blocked = true;
    this.setStatus("error", issueFrom(e));
  }

  private flush() {
    this.clearTimer();
    if (!this.dirty || !this.latest || this.stopped) return;

    const payload: Record<string, unknown> = {
      ...stripUndefined(this.latest),
      schemaVersion: SCHEMA_VERSION,
    };
    this.dirty = false;
    this.inflight++;

    this.backend.write(payload).then(
      () => {
        this.inflight--;
        this.failures = 0;
        if (!this.dirty && this.inflight === 0) this.setStatus("synced");
      },
      (e) => {
        // Rule 4: keep the change, tell the user, try again.
        this.inflight--;
        this.dirty = true;
        this.failures++;
        const issue = issueFrom(e);
        this.setStatus("error", issue === "unknown" ? "write-failed" : issue);
        const delays = this.retryDelaysMs;
        this.arm(delays[Math.min(this.failures - 1, delays.length - 1)]);
      },
    );
  }
}

// ── Firestore backend ─────────────────────────────────────────────────────────

export function firestoreBackend(db: Firestore, uid: string): DashboardBackend {
  const ref = doc(db, "users", uid, "data", "dashboard");
  return {
    subscribe(onSnap, onError) {
      // includeMetadataChanges: also get notified when an answer that came from
      // the cache is later confirmed by the server (needed to leave "offline").
      return onSnapshot(
        ref,
        { includeMetadataChanges: true },
        (snap) =>
          onSnap({
            exists: snap.exists(),
            fromCache: snap.metadata.fromCache,
            data: snap.exists() ? snap.data() : undefined,
          }),
        onError,
      );
    },
    write: (payload) => setDoc(ref, { ...payload, updatedAt: serverTimestamp() }),
  };
}

// ── Automatic daily backups ───────────────────────────────────────────────────
//
// users/{uid}/backups/{YYYY-MM-DD}  →  copy of the dashboard as it was when the
// app was first opened that day (i.e. before any change made that day).
// The 14 most recent are kept. Empty dashboards are never backed up, so a wipe
// cannot push good backups out of the window.

export const BACKUP_KEEP = 14;
const BACKUP_ID = /^\d{4}-\d{2}-\d{2}$/;

export interface BackupInfo {
  id: string; // YYYY-MM-DD
  tabCount: number;
  feedCount: number;
  bookmarkCount: number;
}

export interface BackupsApi {
  list(): Promise<BackupInfo[]>;
  load(id: string): Promise<ParsedBackup>;
}

export function backupIdFor(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Ids to delete so that only the `keep` most recent remain. */
export function backupsToPrune(ids: string[], keep = BACKUP_KEEP): string[] {
  return ids
    .filter((id) => BACKUP_ID.test(id))
    .sort()
    .reverse()
    .slice(keep);
}

export async function ensureDailyBackup(
  db: Firestore,
  uid: string,
  state: DashboardState,
  now = new Date(),
): Promise<boolean> {
  const counts = summarizeState(state);
  if (counts.feedCount + counts.bookmarkCount === 0) return false;

  const ref = doc(db, "users", uid, "backups", backupIdFor(now));
  if ((await getDoc(ref)).exists()) return false;

  await setDoc(ref, {
    createdAt: serverTimestamp(),
    ...counts,
    data: stripUndefined(state),
  });

  const all = await getDocs(collection(db, "users", uid, "backups"));
  await Promise.all(
    backupsToPrune(all.docs.map((d) => d.id)).map((id) =>
      deleteDoc(doc(db, "users", uid, "backups", id)),
    ),
  );
  return true;
}

export function firestoreBackups(db: Firestore, uid: string): BackupsApi {
  return {
    async list() {
      const snap = await getDocs(collection(db, "users", uid, "backups"));
      return snap.docs
        .filter((d) => BACKUP_ID.test(d.id))
        .map((d) => {
          const v = d.data() as Partial<BackupInfo>;
          return {
            id: d.id,
            tabCount: Number(v.tabCount) || 0,
            feedCount: Number(v.feedCount) || 0,
            bookmarkCount: Number(v.bookmarkCount) || 0,
          };
        })
        .sort((a, b) => b.id.localeCompare(a.id));
    },
    async load(id) {
      const snap = await getDoc(doc(db, "users", uid, "backups", id));
      if (!snap.exists()) throw new Error("This backup no longer exists.");
      return normalizeDashboardState((snap.data() as { data?: unknown }).data);
    },
  };
}
