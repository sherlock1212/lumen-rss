import { useCallback, useEffect, useRef } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

const MAX_PER_FEED = 300;
const SAVE_DEBOUNCE_MS = 1500;

type SeenMap = Record<string, string[]>;

// Shared cache across all feed widgets for the current user so we only keep
// one Firestore subscription and one save timer.
const cache: {
  uid: string | null;
  map: SeenMap;
  /** Feeds changed here and not yet saved: a snapshot must not overwrite them. */
  dirtyFeeds: Set<string>;
  loaded: boolean;
  subscribers: Set<() => void>;
  unsub: (() => void) | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
} = {
  uid: null,
  map: {},
  dirtyFeeds: new Set(),
  loaded: false,
  subscribers: new Set(),
  unsub: null,
  saveTimer: null,
};

function notify() {
  for (const cb of cache.subscribers) cb();
}

function scheduleSave() {
  if (!cache.uid || !cache.loaded) return;
  if (cache.saveTimer) clearTimeout(cache.saveTimer);
  const uid = cache.uid;
  cache.saveTimer = setTimeout(() => {
    cache.saveTimer = null;
    cache.dirtyFeeds.clear();
    setDoc(doc(db, "users", uid, "data", "seen"), { map: cache.map }).catch((e) =>
      console.error("Seen items save failed:", e),
    );
  }, SAVE_DEBOUNCE_MS);
}

function bind(uid: string | null) {
  if (cache.uid === uid) return;
  if (cache.unsub) {
    cache.unsub();
    cache.unsub = null;
  }
  if (cache.saveTimer) {
    clearTimeout(cache.saveTimer);
    cache.saveTimer = null;
  }
  cache.uid = uid;
  cache.map = {};
  cache.dirtyFeeds.clear();
  cache.loaded = false;
  if (!uid) {
    notify();
    return;
  }
  cache.unsub = onSnapshot(
    doc(db, "users", uid, "data", "seen"),
    (snap) => {
      // An empty answer from the local cache is not "nothing saved": wait for the
      // server, otherwise we would later overwrite the real data with a partial map.
      if (snap.metadata.fromCache && !snap.exists()) return;
      const data = snap.data() as { map?: SeenMap } | undefined;
      const remote = data?.map ?? {};
      // Keep what this device changed and has not saved yet.
      for (const f of cache.dirtyFeeds) if (cache.map[f]) remote[f] = cache.map[f];
      cache.map = remote;
      cache.loaded = true;
      notify();
    },
    (e) => console.error("Seen items subscription error:", e),
  );
}

export function useSeenItems(feedUrl: string) {
  const { user } = useAuth();
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid ?? null;
    uidRef.current = uid;
    bind(uid);
    const cb = () => {};
    cache.subscribers.add(cb);
    return () => {
      cache.subscribers.delete(cb);
    };
  }, [user]);

  const computeNew = useCallback(
    (links: string[]): Set<string> => {
      const newSet = new Set<string>();
      // For guests or before Firestore loads, don't flag anything as new
      // and don't persist.
      const canPersist = !!cache.uid && cache.loaded;
      const prev = cache.map[feedUrl];
      if (prev !== undefined) {
        const prevSet = new Set(prev);
        for (const l of links) if (l && !prevSet.has(l)) newSet.add(l);
      }
      // Write only when the list of entries really changed: a refresh that brings
      // the same entries costs no database write.
      if (canPersist) {
        const next = links.slice(0, MAX_PER_FEED);
        const prevSet = prev ? new Set(prev) : null;
        const same =
          prevSet !== null && prev!.length === next.length && next.every((l) => prevSet.has(l));
        if (!same) {
          cache.map[feedUrl] = next;
          cache.dirtyFeeds.add(feedUrl);
          scheduleSave();
        }
      }
      return newSet;
    },
    [feedUrl],
  );

  return { computeNew };
}
