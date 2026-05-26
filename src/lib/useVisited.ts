import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

const MAX = 5000;
const SAVE_DEBOUNCE_MS = 1500;

export function useVisited() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const setRef = useRef<Set<string>>(new Set());
  const loadedForUidRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    dirtyRef.current = false;
    if (!user) {
      loadedForUidRef.current = null;
      setRef.current = new Set();
      force((n) => n + 1);
      return;
    }
    const ref = doc(db, "users", user.uid, "data", "visited");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { links?: string[] } | undefined;
        setRef.current = new Set(data?.links ?? []);
        loadedForUidRef.current = user.uid;
        force((n) => n + 1);
      },
      (e) => console.error("Visited subscription error:", e),
    );
    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [user]);

  const scheduleSave = useCallback(() => {
    if (!user || loadedForUidRef.current !== user.uid) return;
    dirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const uid = user.uid;
      let arr = Array.from(setRef.current);
      if (arr.length > MAX) arr = arr.slice(arr.length - MAX);
      setDoc(doc(db, "users", uid, "data", "visited"), { links: arr }).catch(
        (e) => console.error("Visited save failed:", e),
      );
      dirtyRef.current = false;
    }, SAVE_DEBOUNCE_MS);
  }, [user]);

  const isVisited = useCallback((link: string) => setRef.current.has(link), []);
  const markVisited = useCallback(
    (link: string) => {
      if (!link || setRef.current.has(link)) return;
      setRef.current.add(link);
      force((n) => n + 1);
      scheduleSave();
    },
    [scheduleSave],
  );

  return { isVisited, markVisited };
}
