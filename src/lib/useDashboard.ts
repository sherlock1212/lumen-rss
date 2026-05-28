import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";
import type { DashboardState, DashboardTab, FeedWidget, TileStyle } from "./rss";

/**
 * Firestore silently drops `undefined` fields — it doesn't write them and
 * doesn't clear existing values at those paths. This breaks setGlobalStyle
 * (which sets defaultStyle/style to undefined) and importTabs (widgets with
 * customTitle: undefined). Fix: replace every undefined with null before saving.
 */
function sanitize<T>(value: T): T {
  if (value === undefined) return null as unknown as T;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sanitize(v);
  }
  return out as T;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyState(): DashboardState {
  const tabId = uid();
  const tab: DashboardTab = {
    id: tabId,
    name: "Home",
    columns: 3,
    widgets: [],
  };
  return { tabs: [tab], activeTabId: tabId, globalDefaultStyle: "full", highlightNew: true };
}

function starterState(): DashboardState {
  const tabId = uid();
  const tab: DashboardTab = {
    id: tabId,
    name: "Home",
    columns: 3,
    widgets: [
      { id: uid(), url: "https://hnrss.org/frontpage", column: 0 },
      { id: uid(), url: "https://www.theverge.com/rss/index.xml", column: 1 },
      { id: uid(), url: "https://news.ycombinator.com/rss", column: 2 },
    ],
  };
  return { tabs: [tab], activeTabId: tabId, globalDefaultStyle: "full", highlightNew: true };
}

export function useDashboard() {
  const { user } = useAuth();
  const [state, setState] = useState<DashboardState>(() => emptyState());

  // When > 0, we have a local change that hasn't been flushed to Firestore yet.
  // Incoming snapshots must be ignored during this window to avoid reverting
  // in-flight edits (Firestore can echo a stale snapshot within the debounce).
  const pendingWriteRef = useRef(0); // stores the setTimeout id, or 0 if none

  // Track which uid we've loaded for so we don't save before the first snapshot.
  const loadedForUidRef = useRef<string | null>(null);

  // ── Firestore subscription ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      loadedForUidRef.current = null;
      pendingWriteRef.current = 0;
      setState(emptyState());
      return;
    }

    const ref = doc(db, "users", user.uid, "data", "dashboard");
    let firstSnapshot = true;

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        // While we have a local write pending, ignore remote snapshots —
        // they may reflect an older server state and would revert the user's edit.
        if (pendingWriteRef.current !== 0) return;

        if (firstSnapshot && !snap.exists()) {
          const seed = starterState();
          loadedForUidRef.current = user.uid;
          setState(seed);
          try {
            await setDoc(ref, sanitize(seed));
          } catch (e) {
            console.error("Failed to seed dashboard:", e);
          }
        } else if (snap.exists()) {
          const data = snap.data() as DashboardState;
          if (data.globalDefaultStyle === undefined) data.globalDefaultStyle = "full";
          if (data.highlightNew === undefined) data.highlightNew = true;
          loadedForUidRef.current = user.uid;
          setState(data);
        }
        firstSnapshot = false;
      },
      (err) => {
        console.error("Dashboard subscription error:", err);
      },
    );

    return () => {
      unsub();
      // Clear any pending debounce timer on unmount/user-change.
      if (pendingWriteRef.current) {
        clearTimeout(pendingWriteRef.current);
        pendingWriteRef.current = 0;
      }
    };
  }, [user]);

  // ── Persist on change (debounced 400ms) ──────────────────────────────────
  // NOTE: this effect only runs for user-driven changes because `userMutate`
  // is the only path that sets pendingWriteRef before calling setState.
  // Snapshot-driven setState calls never reach the save path because
  // pendingWriteRef is 0 when the snapshot arrives (see guard above).
  useEffect(() => {
    if (!user || loadedForUidRef.current !== user.uid) return;
    // pendingWriteRef === 0 means this setState came from a snapshot, not the user.
    if (pendingWriteRef.current === 0) return;

    const ref = doc(db, "users", user.uid, "data", "dashboard");

    // Clear any previously scheduled timer, then schedule a fresh one.
    clearTimeout(pendingWriteRef.current);
    const t = window.setTimeout(() => {
      pendingWriteRef.current = 0; // write is flushed; snapshots are welcome again
      setDoc(ref, sanitize(state)).catch((e) => console.error("Save failed:", e));
    }, 400);
    pendingWriteRef.current = t;

    // No cleanup clearTimeout here on purpose: we want the timer to survive
    // rapid consecutive state changes (each re-schedules it above). The timer
    // is only cancelled by: (a) the next mutation re-scheduling it, or
    // (b) the subscription cleanup on unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // ── Shared helper for ALL user-driven mutations ───────────────────────────
  // Sets pendingWriteRef to a sentinel (1) BEFORE setState so the save effect
  // knows this is a user change (not a snapshot echo) and schedules a write.
  function userMutate(updater: (s: DashboardState) => DashboardState) {
    // Mark as dirty before React processes the new state.
    // The save effect will replace this with the real timer id.
    if (pendingWriteRef.current === 0) {
      pendingWriteRef.current = 1; // sentinel: "dirty, timer not yet assigned"
    }
    setState(updater);
  }

  // ── Selectors / derived state ─────────────────────────────────────────────
  const activeTab =
    state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateTab = useCallback(
    (tabId: string, updater: (t: DashboardTab) => DashboardTab) => {
      userMutate((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? updater(t) : t)),
      }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const addWidget = useCallback(
    (url: string, customTitle?: string) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        const counts = Array.from({ length: tab.columns }, (_, i) =>
          tab.widgets.filter((w) => w.column === i).length,
        );
        const col = counts.indexOf(Math.min(...counts));
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id
              ? { ...t, widgets: [...t.widgets, { id: uid(), url, customTitle, column: col }] }
              : t,
          ),
        };
      });
    },
    [],
  );

  const removeWidget = useCallback((widgetId: string) => {
    userMutate((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      return {
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) }
            : t,
        ),
      };
    });
  }, []);

  const updateWidget = useCallback((widgetId: string, patch: Partial<FeedWidget>) => {
    userMutate((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      return {
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, widgets: t.widgets.map((w) => w.id === widgetId ? { ...w, ...patch } : w) }
            : t,
        ),
      };
    });
  }, []);

  const reorderWidgets = useCallback(
    (activeId: string, overColumn: number, overIndex: number) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        const moving = tab.widgets.find((w) => w.id === activeId);
        if (!moving) return s;
        const without = tab.widgets.filter((w) => w.id !== activeId);
        const updated: FeedWidget = { ...moving, column: overColumn };
        const colItems = without.filter((w) => w.column === overColumn);
        const insertAt = overIndex < 0 ? colItems.length : overIndex;
        colItems.splice(insertAt, 0, updated);
        const result: FeedWidget[] = [];
        const consumed = new Set<string>();
        for (const w of without) {
          if (w.column === overColumn) {
            if (consumed.has("col")) continue;
            consumed.add("col");
            result.push(...colItems);
          } else {
            result.push(w);
          }
        }
        if (!consumed.has("col")) result.push(...colItems);
        return {
          ...s,
          tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, widgets: result } : t)),
        };
      });
    },
    [],
  );

  const setColumns = useCallback((n: number) => {
    userMutate((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      return {
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, columns: n, widgets: t.widgets.map((w) => ({ ...w, column: Math.min(w.column, n - 1) })) }
            : t,
        ),
      };
    });
  }, []);

  const addTab = useCallback((name: string) => {
    const id = uid();
    userMutate((s) => ({
      ...s,
      tabs: [...s.tabs, { id, name, columns: 3, widgets: [] }],
      activeTabId: id,
    }));
  }, []);

  const removeTab = useCallback((tabId: string) => {
    userMutate((s) => {
      if (s.tabs.length <= 1) return s;
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      return {
        ...s,
        tabs,
        activeTabId: s.activeTabId === tabId ? tabs[0].id : s.activeTabId,
      };
    });
  }, []);

  const renameTab = useCallback((tabId: string, name: string) => {
    userMutate((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
    }));
  }, []);

  const reorderTabs = useCallback((activeId: string, overId: string) => {
    userMutate((s) => {
      const oldIdx = s.tabs.findIndex((t) => t.id === activeId);
      const newIdx = s.tabs.findIndex((t) => t.id === overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return s;
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(oldIdx, 1);
      tabs.splice(newIdx, 0, moved);
      return { ...s, tabs };
    });
  }, []);

  const setActiveTab = useCallback((tabId: string) => {
    userMutate((s) => ({ ...s, activeTabId: tabId }));
  }, []);

  const setTabStyle = useCallback((style: TileStyle) => {
    userMutate((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      return {
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? { ...t, defaultStyle: style, widgets: t.widgets.map((w) => ({ ...w, style: undefined })) }
            : t,
        ),
      };
    });
  }, []);

  const setGlobalStyle = useCallback((style: TileStyle) => {
    userMutate((s) => ({
      ...s,
      globalDefaultStyle: style,
      tabs: s.tabs.map((t) => ({
        ...t,
        defaultStyle: undefined,
        widgets: t.widgets.map((w) => ({ ...w, style: undefined })),
      })),
    }));
  }, []);

  const setHighlightNew = useCallback((v: boolean) => {
    userMutate((s) => ({ ...s, highlightNew: v }));
  }, []);

  const importTabs = useCallback((newTabs: DashboardTab[]) => {
    if (newTabs.length === 0) return;
    userMutate((s) => ({
      ...s,
      tabs: [...s.tabs, ...newTabs],
      activeTabId: newTabs[0].id,
    }));
  }, []);

  const widgetsByColumn = (col: number): FeedWidget[] =>
    activeTab.widgets.filter((w) => w.column === col);

  const resolveStyle = useCallback(
    (w: FeedWidget): TileStyle =>
      w.style ?? activeTab.defaultStyle ?? state.globalDefaultStyle ?? "full",
    [activeTab.defaultStyle, state.globalDefaultStyle],
  );

  return {
    state,
    activeTab,
    isGuest: !user,
    widgetsByColumn,
    addWidget,
    removeWidget,
    updateWidget,
    reorderWidgets,
    setColumns,
    addTab,
    removeTab,
    renameTab,
    reorderTabs,
    setActiveTab,
    setTabStyle,
    setGlobalStyle,
    setHighlightNew,
    importTabs,
    resolveStyle,
  };
}
