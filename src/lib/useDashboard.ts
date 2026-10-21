import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { db } from "./firebase";
import { useAuth } from "./useAuth";
import {
  DashboardSync,
  ensureDailyBackup,
  firestoreBackend,
  firestoreBackups,
  type SyncIssue,
  type SyncStatus,
} from "./dashboardSync";
import type { DashboardState, DashboardTab, FeedWidget, TileStyle } from "./rss";
import { uid } from "./utils";
import { clampColumns, fitToColumns, moveWidget } from "./layout";
import { readActiveTab, withActiveTab, writeActiveTab } from "./activeTab";

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

export interface SyncInfo {
  status: SyncStatus;
  issue?: SyncIssue;
}

export function useDashboard() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid ?? null;

  const [state, setState] = useState<DashboardState>(() => emptyState());
  const [sync, setSync] = useState<SyncInfo>({ status: "loading" });

  // `stateRef` always holds the latest state (even before React re-renders) and is
  // what every mutation starts from. `syncRef` is the live Firestore sync, if signed in.
  const stateRef = useRef(state);
  const syncRef = useRef<DashboardSync | null>(null);
  // Always the current user, also for callbacks created on an earlier render.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const applyState = useCallback((next: DashboardState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // ── Connect to Firestore ──────────────────────────────────────────────────
  // All the safety rules (never save before the server has confirmed what is
  // stored, never overwrite unreadable data, retry failed saves, ...) live in
  // DashboardSync; see dashboardSync.ts.
  useEffect(() => {
    if (authLoading) {
      setSync({ status: "loading" });
      return;
    }
    if (!userId) {
      syncRef.current = null;
      applyState(emptyState());
      setSync({ status: "loading" });
      return;
    }

    // Shown (in memory only) if the account has no saved dashboard yet.
    // It is written to Firestore only when the user changes something.
    const starter = starterState();
    const dashSync = new DashboardSync(firestoreBackend(db, userId), {
      onRemote: (remote) => {
        // Keep the tab the user has open (it is not saved in the database): first the
        // one currently shown, then the one remembered on this device, then the saved one.
        const next = withActiveTab(remote ?? starter, [
          stateRef.current.activeTabId,
          readActiveTab(userId),
        ]);
        if (JSON.stringify(next) !== JSON.stringify(stateRef.current)) applyState(next);
      },
      onStatus: (status, issue) => setSync({ status, issue }),
      onConfirmed: (remote) => {
        if (remote) {
          ensureDailyBackup(db, userId, remote).catch((e) =>
            console.warn("Daily backup skipped:", e),
          );
        }
      },
    });
    syncRef.current = dashSync;
    setSync({ status: "loading" });
    dashSync.start();

    return () => {
      dashSync.stop({ flush: true });
      if (syncRef.current === dashSync) syncRef.current = null;
    };
  }, [userId, authLoading, applyState]);

  // Don't lose an edit made in the last fraction of a second before the tab closes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (syncRef.current?.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") syncRef.current?.flushNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // ── Shared helper for ALL user-driven mutations ───────────────────────────
  const userMutate = useCallback(
    (updater: (s: DashboardState) => DashboardState) => {
      const dashSync = syncRef.current;
      // Signed in, but the stored dashboard has not been safely loaded yet
      // (or could not be read): ignore the edit rather than risk overwriting it.
      if (dashSync && !dashSync.canEdit()) return;

      const prev = stateRef.current;
      const next = updater(prev);
      if (next === prev) return;
      applyState(next);
      // A new tab / import / restore switches to a tab: remember it on this device.
      if (userIdRef.current && next.activeTabId !== prev.activeTabId) {
        writeActiveTab(userIdRef.current, next.activeTabId);
      }
      dashSync?.schedule(next);
    },
    [applyState],
  );

  // ── Selectors / derived state ─────────────────────────────────────────────
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateTab = useCallback(
    (tabId: string, updater: (t: DashboardTab) => DashboardTab) => {
      userMutate((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? updater(t) : t)),
      }));
    },
    [userMutate],
  );

  const addWidget = useCallback(
    (url: string, customTitle?: string) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        const counts = Array.from(
          { length: tab.columns },
          (_, i) => tab.widgets.filter((w) => w.column === i).length,
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
    [userMutate],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id ? { ...t, widgets: t.widgets.filter((w) => w.id !== widgetId) } : t,
          ),
        };
      });
    },
    [userMutate],
  );

  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<FeedWidget>) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  widgets: t.widgets.map((w) => (w.id === widgetId ? { ...w, ...patch } : w)),
                }
              : t,
          ),
        };
      });
    },
    [userMutate],
  );

  const reorderWidgets = useCallback(
    (activeId: string, overColumn: number, overIndex: number) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        const widgets = moveWidget(tab.widgets, activeId, overColumn, overIndex);
        if (widgets === tab.widgets) return s; // dropped where it already was: nothing to save
        return {
          ...s,
          tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, widgets } : t)),
        };
      });
    },
    [userMutate],
  );

  const setColumns = useCallback(
    (n: number) => {
      const columns = clampColumns(n);
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        if (tab.columns === columns) return s; // nothing to change, nothing to save
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id ? { ...t, columns, widgets: fitToColumns(t.widgets, columns) } : t,
          ),
        };
      });
    },
    [userMutate],
  );

  const addTab = useCallback(
    (name: string) => {
      const id = uid();
      userMutate((s) => ({
        ...s,
        tabs: [...s.tabs, { id, name, columns: 3, widgets: [] }],
        activeTabId: id,
      }));
    },
    [userMutate],
  );

  const removeTab = useCallback(
    (tabId: string) => {
      userMutate((s) => {
        if (s.tabs.length <= 1) return s;
        const tabs = s.tabs.filter((t) => t.id !== tabId);
        return {
          ...s,
          tabs,
          activeTabId: s.activeTabId === tabId ? tabs[0].id : s.activeTabId,
        };
      });
    },
    [userMutate],
  );

  const renameTab = useCallback(
    (tabId: string, name: string) => {
      userMutate((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
      }));
    },
    [userMutate],
  );

  const reorderTabs = useCallback(
    (activeId: string, overId: string) => {
      userMutate((s) => {
        const oldIdx = s.tabs.findIndex((t) => t.id === activeId);
        const newIdx = s.tabs.findIndex((t) => t.id === overId);
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return s;
        const tabs = [...s.tabs];
        const [moved] = tabs.splice(oldIdx, 1);
        tabs.splice(newIdx, 0, moved);
        return { ...s, tabs };
      });
    },
    [userMutate],
  );

  // Switching tab changes what is shown, not what is saved: no database write.
  const setActiveTab = useCallback(
    (tabId: string) => {
      const prev = stateRef.current;
      if (tabId === prev.activeTabId || !prev.tabs.some((t) => t.id === tabId)) return;
      applyState({ ...prev, activeTabId: tabId });
      if (userIdRef.current) writeActiveTab(userIdRef.current, tabId);
    },
    [applyState],
  );

  const setTabStyle = useCallback(
    (style: TileStyle) => {
      userMutate((s) => {
        const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
        return {
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === tab.id
              ? {
                  ...t,
                  defaultStyle: style,
                  widgets: t.widgets.map((w) => ({ ...w, style: undefined })),
                }
              : t,
          ),
        };
      });
    },
    [userMutate],
  );

  const setGlobalStyle = useCallback(
    (style: TileStyle) => {
      userMutate((s) => ({
        ...s,
        globalDefaultStyle: style,
        tabs: s.tabs.map((t) => ({
          ...t,
          defaultStyle: undefined,
          widgets: t.widgets.map((w) => ({ ...w, style: undefined })),
        })),
      }));
    },
    [userMutate],
  );

  const setHighlightNew = useCallback(
    (v: boolean) => {
      userMutate((s) => ({ ...s, highlightNew: v }));
    },
    [userMutate],
  );

  const addBookmarksTile = useCallback(() => {
    userMutate((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeTabId) ?? s.tabs[0];
      const counts = Array.from(
        { length: tab.columns },
        (_, i) => tab.widgets.filter((w) => w.column === i).length,
      );
      const col = counts.indexOf(Math.min(...counts));
      return {
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === tab.id
            ? {
                ...t,
                widgets: [
                  ...t.widgets,
                  {
                    id: Math.random().toString(36).slice(2, 10),
                    kind: "bookmarks" as const,
                    url: "",
                    customTitle: "Favourites",
                    column: col,
                    bookmarks: [],
                  },
                ],
              }
            : t,
        ),
      };
    });
  }, [userMutate]);

  const importTabs = useCallback(
    (newTabs: DashboardTab[]) => {
      if (newTabs.length === 0) return;
      userMutate((s) => ({
        ...s,
        tabs: [...s.tabs, ...newTabs],
        activeTabId: newTabs[0].id,
      }));
    },
    [userMutate],
  );

  /** Replace the whole dashboard (used by "restore from JSON backup"). */
  const replaceState = useCallback(
    (next: DashboardState) => {
      const dashSync = syncRef.current;
      // `force`: an explicit restore is allowed even when the stored data was
      // unreadable, but still only after the server has confirmed it.
      if (dashSync && !dashSync.schedule(next, { force: true })) return;
      applyState(next);
      if (userIdRef.current) writeActiveTab(userIdRef.current, next.activeTabId);
    },
    [applyState],
  );

  const widgetsByColumn = (col: number): FeedWidget[] =>
    activeTab.widgets.filter((w) => w.column === col);

  const resolveStyle = useCallback(
    (w: FeedWidget): TileStyle =>
      w.style ?? activeTab.defaultStyle ?? state.globalDefaultStyle ?? "full",
    [activeTab.defaultStyle, state.globalDefaultStyle],
  );

  const backups = useMemo(() => (userId ? firestoreBackups(db, userId) : null), [userId]);

  return {
    state,
    activeTab,
    sync,
    backups,
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
    addBookmarksTile,
    importTabs,
    replaceState,
    resolveStyle,
  };
}
