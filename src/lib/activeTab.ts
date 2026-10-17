// Which tab is open is a per-device, per-moment choice, like a scroll position.
// It is kept in localStorage instead of the saved dashboard, so switching tab does
// not trigger a database write (and does not flash "Saving" in the header).
//
// The saved dashboard still contains an `activeTabId` (the tab that was open at the
// last real edit); it is only a fallback for a device that has no local choice yet.

import type { DashboardState } from "./rss";

const key = (uid: string) => `lumen:activeTab:${uid}`;

export function readActiveTab(uid: string): string | null {
  try {
    return window.localStorage.getItem(key(uid));
  } catch {
    return null; // storage blocked or unavailable: fall back to the saved value
  }
}

export function writeActiveTab(uid: string, tabId: string) {
  try {
    window.localStorage.setItem(key(uid), tabId);
  } catch {
    /* ignore */
  }
}

/**
 * Applies the local choice on top of a state coming from the server.
 * `preferred` is tried in order; the first id that is still a tab wins.
 */
export function withActiveTab(
  state: DashboardState,
  preferred: Array<string | null | undefined>,
): DashboardState {
  for (const id of preferred) {
    if (id && state.tabs.some((t) => t.id === id)) {
      return id === state.activeTabId ? state : { ...state, activeTabId: id };
    }
  }
  return state;
}
