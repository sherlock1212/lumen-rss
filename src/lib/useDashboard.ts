import { useEffect, useState, useCallback } from "react";
import type { DashboardState, DashboardTab, FeedWidget } from "./rss";

const STORAGE_KEY = "lumen-rss-dashboard-v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultState(): DashboardState {
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
  return { tabs: [tab], activeTabId: tabId };
}

export function useDashboard() {
  const [state, setState] = useState<DashboardState>(() => {
    if (typeof window === "undefined") return defaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as DashboardState;
    } catch {}
    return defaultState();
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

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
        // place in shortest column
        const counts = Array.from({ length: t.columns }, (_, i) =>
          t.widgets.filter((w) => w.column === i).length,
        );
        const col = counts.indexOf(Math.min(...counts));
        return {
          ...t,
          widgets: [...t.widgets, { id: uid(), url, customTitle, column: col }],
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

  const moveWidget = useCallback(
    (widgetId: string, direction: "left" | "right") => {
      updateTab(activeTab.id, (t) => ({
        ...t,
        widgets: t.widgets.map((w) =>
          w.id === widgetId
            ? {
                ...w,
                column: Math.max(
                  0,
                  Math.min(
                    t.columns - 1,
                    w.column + (direction === "left" ? -1 : 1),
                  ),
                ),
              }
            : w,
        ),
      }));
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

  const renameTab = useCallback(
    (tabId: string, name: string) => {
      setState((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, name } : t)),
      }));
    },
    [],
  );

  const setActiveTab = useCallback((tabId: string) => {
    setState((s) => ({ ...s, activeTabId: tabId }));
  }, []);

  const widgetsByColumn = (col: number): FeedWidget[] =>
    activeTab.widgets.filter((w) => w.column === col);

  return {
    state,
    activeTab,
    widgetsByColumn,
    addWidget,
    removeWidget,
    moveWidget,
    setColumns,
    addTab,
    removeTab,
    renameTab,
    setActiveTab,
  };
}
