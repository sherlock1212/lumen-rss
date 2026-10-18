import { useEffect, useRef } from "react";

export const REFRESH_MS = 10 * 60 * 1000;

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * Should a feed be refreshed now? Never while the page is hidden (background tab)
 * or while a fetch is already running; otherwise once the data is older than the
 * interval plus a per-feed jitter (so feeds do not all refresh at the same moment).
 */
export function refreshDue(o: {
  hidden: boolean;
  fetching: boolean;
  now: number;
  lastUpdated: number;
  intervalMs: number;
  jitterMs: number;
}): boolean {
  if (o.hidden || o.fetching) return false;
  return o.now - o.lastUpdated >= o.intervalMs + o.jitterMs;
}

/** Periodic refresh that pauses while the page is hidden and catches up when it is shown again. */
export function useAutoRefresh(opts: {
  id: string;
  lastUpdated: number;
  fetching: boolean;
  refetch: () => unknown;
  intervalMs?: number;
  tickMs?: number;
}) {
  const { id, intervalMs = REFRESH_MS, tickMs = 30_000 } = opts;
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    const jitterMs = hashStr(id) % Math.max(1, Math.floor(intervalMs / 5));
    const check = () => {
      const cur = latest.current;
      if (
        refreshDue({
          hidden: document.visibilityState === "hidden",
          fetching: cur.fetching,
          now: Date.now(),
          lastUpdated: cur.lastUpdated,
          intervalMs,
          jitterMs,
        })
      ) {
        cur.refetch();
      }
    };
    const timer = setInterval(check, tickMs);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [id, intervalMs, tickMs]);
}
