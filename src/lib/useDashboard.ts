import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";
import type { DashboardState, DashboardTab, FeedWidget, TileStyle } from "./rss";

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

  // Tracks whether the current `state` reflects data loaded from Firestore
  // for the current user. Until true, we don't persist changes.
  const loadedForUidRef = useRef<string | null>(null);
  // Skip the very next save triggered by hydrating from a snapshot.
  const skipNextSaveRef = useRef(false);

  // Subscribe to the logged-in user's dashboard doc; reset to empty on logout.
  useEffect(() => {
    if (!user) {
      loadedForUidRef.current = null;
      skipNextSaveRef.current = true;
      setState(emptyState());
      return;
    }

    const ref = doc(db, "users", user.uid, "data", "dashboard");
    let firstSnapshot = true;

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (firstSnapshot && !snap.exists()) {
          // First-time user: seed with starter feeds and persist immediately.
          const seed = starterState();
          loadedForUidRef.current = user.uid;
          skipNextSaveRef.current = true;
          setState(seed);
          try {
            await setDoc(ref, seed);
          } catch (e) {
            console.error("Failed to seed dashboard:", e);
          }
        } else if (snap.exists()) {
          const data = snap.data() as DashboardState;
          if (data.globalDefaultStyle === undefined) data.globalDefaultStyle = "full";
          if (data.highlightNew === undefined) data.highlightNew = true;
          loadedForUidRef.current = user.uid;
          skipNextSaveRef.current = true;
          setState(data);
        }
        firstSnapshot = false;
      },
      (err) => {
        console.error("Dashboard subscription error:", err);
      },
    );

    return () => unsub();
  }, [user]);

  // Persist state changes to Firestore (debounced) once loaded for this user.
  useEffect(() => {
    if (!user || loadedForUidRef.current !== user.uid) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const ref = doc(db, "users", user.uid, "data", "dashboard");
    const t = setTimeout(() => {
      setDoc(ref, state).catch((e) => console.error("Save failed:", e));
    }, 400);
    return () => clearTimeout(t);
  }, [state, user]);

  const activeTab =
    state.tabs.find((t) => t.id === state.activeTabId) ?? state.tabs[0];

  const updateTab = useCallback(
    (tabId: string, updater: (t: DashboardTab) => DashboardTab) => {
      setState((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? updater(t) : t)),
      }));
    },
    [],
  );

  const addWidget = useCallback(
    (url: string, customTitle?: string) => {
      updateTab(activeTab.id, (t) => {
        const counts = Array.from({ length: t.columns }, (_, i) =>
          t.widgets.filter((w) => w.column === i).length,
        );
        const col = counts.indexOf(Math.min(...counts));
        return {
          ...t,
          widgets: [
            ...t.widgets,
            { id: uid(), url, customTitle, column: col },
          ],
        };
      });
    },
    [activeTab.id, updateTab],
  );

  const removeWidget = useCallback(
    (widgetId: string) => {
      updateTab(activeTab.id, (t) => ({
        ...t,
        widgets: t.widgets.filter((w) => w.id !== widgetId),
      }));
    },
    [activeTab.id, updateTab],
  );

  const updateWidget = useCallback(
    (widgetId: string, patch: Partial<FeedWidget>) => {
      updateTab(activeTab.id, (t) => ({
        ...t,
        widgets: t.widgets.map((w) =>
          w.id === widgetId ? { ...w, ...patch } : w,
        ),
      }));
    },
    [activeTab.id, updateTab],
  );

  const reorderWidgets = useCallback(
    (activeId: string, overColumn: number, overIndex: number) => {
      updateTab(activeTab.id, (t) => {
        const moving = t.widgets.find((w) => w.id === activeId);
        if (!moving) return t;
        const without = t.widgets.filter((w) => w.id !== activeId);
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
        return { ...t, widgets: result };
      });
    },
    [activeTab.id, updateTab],
  );

  const setColumns = useCallback(
    (n: number) => {
      updateTab(activeTab.id, (t) => ({
        ...t,
        columns: n,
        widgets: t.widgets.map((w) => ({
          ...w,
          column: Math.min(w.column, n - 1),
        })),
      }));
    },
    [activeTab.id, updateTab],
  );

  const addTab = useCallback((name: string) => {
    const id = uid();
    setState((s) => ({
      ...s,
      tabs: [...s.tabs, { id, name, columns: 3, widgets: [] }],
      activeTabId: id,
    }));
  }, []);

  const removeTab = useCallback((tabId: string) => {
    setState((s) => {
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
    setState((s) => ({
      ...s,
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
    }));
  }, []);

  const reorderTabs = useCallback((activeId: string, overId: string) => {
    setState((s) => {
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
    setState((s) => ({ ...s, activeTabId: tabId }));
  }, []);

  const setTabStyle = useCallback(
    (style: TileStyle) => {
      updateTab(activeTab.id, (t) => ({
        ...t,
        defaultStyle: style,
        widgets: t.widgets.map((w) => ({ ...w, style: undefined })),
      }));
    },
    [activeTab.id, updateTab],
  );

  const setGlobalStyle = useCallback((style: TileStyle) => {
    setState((s) => ({
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
    setState((s) => ({ ...s, highlightNew: v }));
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
    resolveStyle,
  };
}
