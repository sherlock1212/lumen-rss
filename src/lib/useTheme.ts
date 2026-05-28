import { useEffect, useRef, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./useAuth";

export type ThemeId = "aurora" | "cyber" | "slate" | "daylight";

export const THEMES: { id: ThemeId; name: string; description: string }[] = [
  { id: "aurora", name: "Aurora", description: "Deep dark with mint glow" },
  { id: "cyber", name: "Cyber Neon", description: "Black with neon magenta" },
  { id: "slate", name: "Slate", description: "Medium dark, calm blue" },
  { id: "daylight", name: "Daylight", description: "Clean light theme" },
];

const DEFAULT_THEME: ThemeId = "aurora";

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

export function useTheme() {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // true while we are hydrating from Firestore — don't persist during hydration
  const hydratingRef = useRef(false);
  // track which uid we've loaded for, so we don't save before the first snapshot
  const loadedForUidRef = useRef<string | null>(null);

  // Apply theme to DOM immediately on every change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Subscribe to Firestore prefs doc
  useEffect(() => {
    if (!user) {
      loadedForUidRef.current = null;
      hydratingRef.current = true;
      setThemeState(DEFAULT_THEME);
      return;
    }
    const ref = doc(db, "users", user.uid, "data", "prefs");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { theme?: ThemeId } | undefined;
        const t =
          data?.theme && THEMES.some((x) => x.id === data.theme)
            ? data.theme!
            : DEFAULT_THEME;
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
    setDoc(ref, { theme }, { merge: true }).catch((e) =>
      console.error("Theme save failed:", e),
    );
  }, [theme, user]);

  const setTheme = useCallback((id: ThemeId) => {
    // Ensure hydrating flag is off so this user-driven change is persisted
    hydratingRef.current = false;
    setThemeState(id);
  }, []);

  return { theme, setTheme, themes: THEMES };
}
