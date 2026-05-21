import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "lumen-visited-v1";
const MAX = 5000;

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function save(set: Set<string>) {
  try {
    let arr = Array.from(set);
    if (arr.length > MAX) arr = arr.slice(arr.length - MAX);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

export function useVisited() {
  const [, force] = useState(0);
  const setRef = useRef<Set<string>>(load());

  useEffect(() => {
    setRef.current = load();
    force((n) => n + 1);
  }, []);

  const isVisited = useCallback((link: string) => setRef.current.has(link), []);
  const markVisited = useCallback((link: string) => {
    if (!link || setRef.current.has(link)) return;
    setRef.current.add(link);
    save(setRef.current);
    force((n) => n + 1);
  }, []);

  return { isVisited, markVisited };
}
