import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, isTheme, type ThemeId } from "./themeConfig";

export { THEMES };
export type { ThemeId };

export function readCachedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function cacheTheme(id: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // private mode / storage blocked: the theme still works, just without the shortcut
  }
}

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

export function useTheme() {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(() =>
    typeof window === "undefined" ? DEFAULT_THEME : readCachedTheme(),
  );

  // true while we are hydrating from Firestore — don't persist during hydration
  const hydratingRef = useRef(false);
  // track which uid we've loaded for, so we don't save before the first snapshot
  const loadedForUidRef = useRef<string | null>(null);

  // Apply theme to DOM immediately on every change
  useEffect(() => {
    applyTheme(theme);
    cacheTheme(theme);
  }, [theme]);

  // Subscribe to Firestore prefs doc
  useEffect(() => {
    if (!user) {
      // Signed out (or still checking): keep the remembered theme instead of
      // flashing the default one.
      loadedForUidRef.current = null;
      hydratingRef.current = true;
      return;
    }
    const ref = doc(db, "users", user.uid, "data", "prefs");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { theme?: ThemeId } | undefined;
        const t =
          data?.theme && THEMES.some((x) => x.id === data.theme) ? data.theme! : DEFAULT_THEME;
        // Mark as hydrating BEFORE calling setThemeState so the save-effect
        // triggered by this state change is skipped
        hydratingRef.current = true;
        loadedForUidRef.current = user.uid;
        setThemeState(t);
      },
      (e) => console.error("Theme subscription error:", e),
    );
    return () => unsub();
  }, [user]);

  // Persist theme changes to Firestore (skip hydration-triggered updates)
  useEffect(() => {
    if (!user || loadedForUidRef.current !== user.uid) return;

    if (hydratingRef.current) {
      // Clear the flag AFTER this render cycle so the next user-driven change
      // will be persisted normally
      hydratingRef.current = false;
      return;
    }

    const ref = doc(db, "users", user.uid, "data", "prefs");
    setDoc(ref, { theme }, { merge: true }).catch((e) => console.error("Theme save failed:", e));
  }, [theme, user]);

  const setTheme = useCallback((id: ThemeId) => {
    // Ensure hydrating flag is off so this user-driven change is persisted
    hydratingRef.current = false;
    setThemeState(id);
  }, []);

  return { theme, setTheme, themes: THEMES };
}
