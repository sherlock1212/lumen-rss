import { useCallback, useEffect, useSyncExternalStore } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

const MAX = 5000;
const SAVE_DEBOUNCE_MS = 1500;

/**
 * One store shared by every feed card: a single Firestore subscription, a single
 * save timer, and a click in one card is immediately visible in all the others.
 * (Before, each card had its own copy and its own save, racing each other.)
 */
const store: {
  uid: string | null;
  links: Set<string>;
  loaded: boolean;
  dirty: boolean;
  version: number;
  subscribers: Set<() => void>;
  unsub: (() => void) | null;
  saveTimer: ReturnType<typeof setTimeout> | null;
} = {
  uid: null,
  links: new Set(),
  loaded: false,
  dirty: false,
  version: 0,
  subscribers: new Set(),
  unsub: null,
  saveTimer: null,
};

function notify() {
  store.version++;
  for (const cb of store.subscribers) cb();
}

function flush() {
  if (store.saveTimer) {
    clearTimeout(store.saveTimer);
    store.saveTimer = null;
  }
  if (!store.dirty || !store.uid || !store.loaded) return;
  let arr = Array.from(store.links);
  if (arr.length > MAX) arr = arr.slice(arr.length - MAX); // keep the newest
  store.dirty = false;
  setDoc(doc(db, "users", store.uid, "data", "visited"), { links: arr }).catch((e) => {
    store.dirty = true;
    console.error("Visited save failed:", e);
  });
}

function scheduleSave() {
  if (!store.uid || !store.loaded) return;
  store.dirty = true;
  if (store.saveTimer) clearTimeout(store.saveTimer);
  store.saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}

function bind(uid: string | null) {
  if (store.uid === uid) return;
  flush(); // don't lose pending marks of the previous user
  store.unsub?.();
  store.unsub = null;
  store.uid = uid;
  store.links = new Set();
  store.loaded = false;
  store.dirty = false;
  if (!uid) {
    notify();
    return;
  }
  store.unsub = onSnapshot(
    doc(db, "users", uid, "data", "visited"),
    (snap) => {
      // An empty answer from the local cache is not "nothing saved": wait for the
      // server, otherwise we would later overwrite the real list with a partial one.
      if (snap.metadata.fromCache && !snap.exists()) return;
      const remote = (snap.data() as { links?: string[] } | undefined)?.links ?? [];
      // Keep marks made locally that are not saved yet.
      const hadLocal = store.links.size > 0 && (store.dirty || !store.loaded);
      const merged = new Set(remote);
      if (hadLocal) for (const l of store.links) merged.add(l);
      store.links = merged;
      store.loaded = true;
      notify();
      if (hadLocal) scheduleSave();
    },
    (e) => console.error("Visited subscription error:", e),
  );
}

// Save immediately when the tab is hidden or closed, so a click made less than
// 1.5 s earlier isn't lost.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

function subscribe(cb: () => void) {
  store.subscribers.add(cb);
  return () => {
    store.subscribers.delete(cb);
  };
}
const getVersion = () => store.version;

export function useVisited() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  useEffect(() => {
    bind(uid);
  }, [uid]);

  // Re-render whenever the shared set changes.
  useSyncExternalStore(subscribe, getVersion, getVersion);

  const isVisited = useCallback((link: string) => store.links.has(link), []);
  const markVisited = useCallback((link: string) => {
    if (!link || store.links.has(link)) return;
    store.links.add(link);
    notify();
    scheduleSave();
  }, []);

  return { isVisited, markVisited };
}
