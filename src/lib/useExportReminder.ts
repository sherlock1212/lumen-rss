import { useCallback, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";
import {
  parseExportDate,
  readSnooze,
  reminderStatus,
  snoozeUntil,
  writeSnooze,
} from "./exportReminder";

export interface ExportReminder {
  /** False for guests: there is no account to attach a backup date to. */
  enabled: boolean;
  /** The server has told us what is stored (until then nothing is shown). */
  loaded: boolean;
  lastExportAt: Date | null;
  daysSince: number | null;
  due: boolean;
  /** Call right after a full JSON backup has been downloaded. */
  markExported: () => void;
  /** Hide the reminder on this device for a few days. */
  snooze: () => void;
}

export function useExportReminder(): ExportReminder {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [loaded, setLoaded] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<Date | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);

  useEffect(() => {
    setLoaded(false);
    setLastExportAt(null);
    if (!uid) {
      setSnoozedUntil(null);
      return;
    }
    setSnoozedUntil(readSnooze(uid));

    const ref = doc(db, "users", uid, "data", "meta");
    return onSnapshot(
      ref,
      // Also report when the cache answer is later confirmed by the server.
      { includeMetadataChanges: true },
      (snap) => {
        // "No document" from an empty local cache proves nothing (offline / slow):
        // wait for the server, otherwise we would nag someone who did export.
        if (snap.metadata.fromCache && !snap.exists()) return;
        setLastExportAt(parseExportDate(snap.data()?.lastJsonExportAt));
        setLoaded(true);
      },
      (e) => console.error("Backup reminder subscription error:", e),
    );
  }, [uid]);

  const markExported = useCallback(() => {
    if (!uid) return;
    const now = new Date();
    setLastExportAt(now);
    // merge: this document may hold other fields in the future.
    setDoc(
      doc(db, "users", uid, "data", "meta"),
      { lastJsonExportAt: now.toISOString() },
      { merge: true },
    ).catch((e) => console.error("Could not record the backup date:", e));
  }, [uid]);

  const snooze = useCallback(() => {
    if (!uid) return;
    const until = snoozeUntil();
    writeSnooze(uid, until);
    setSnoozedUntil(until);
  }, [uid]);

  const { daysSince, due } = useMemo(
    () => reminderStatus({ lastExportAt, snoozedUntil }),
    [lastExportAt, snoozedUntil],
  );

  return {
    enabled: !!uid,
    loaded,
    lastExportAt,
    daysSince,
    due: !!uid && loaded && due,
    markExported,
    snooze,
  };
}
