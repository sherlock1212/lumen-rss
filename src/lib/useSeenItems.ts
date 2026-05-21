import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "lumen-seen-items-v1";
const MAX_PER_FEED = 300;

type SeenMap = Record<string, string[]>;

function load(): SeenMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function save(map: SeenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Tracks per-feed seen item links. `computeNew` returns links that are NEW
 * relative to the previous snapshot (and updates the snapshot).
 * On very first sight of a feed, nothing is considered new.
 */
export function useSeenItems(feedUrl: string) {
  const mapRef = useRef<SeenMap>(load());
  const initializedRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);

  useEffect(() => {
    mapRef.current = load();
    force((n) => n + 1);
  }, []);

  const computeNew = useCallback(
    (links: string[]): Set<string> => {
      const map = mapRef.current;
      const prev = map[feedUrl];
      const newSet = new Set<string>();
      if (prev === undefined) {
        // First time we ever see this feed — seed it without flagging anything new.
        initializedRef.current.add(feedUrl);
      } else {
        const prevSet = new Set(prev);
        for (const l of links) if (l && !prevSet.has(l)) newSet.add(l);
      }
      // Update snapshot with current links (cap size).
      const next = links.slice(0, MAX_PER_FEED);
      map[feedUrl] = next;
      save(map);
      return newSet;
    },
    [feedUrl],
  );

  return { computeNew };
}
