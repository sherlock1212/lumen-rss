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
  const loadedForUidRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!user) {
      loadedForUidRef.current = null;
      skipNextSaveRef.current = true;
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
            ? data.theme
            : DEFAULT_THEME;
        loadedForUidRef.current = user.uid;
        skipNextSaveRef.current = true;
        setThemeState(t);
      },
      (e) => console.error("Theme subscription error:", e),
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || loadedForUidRef.current !== user.uid) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const ref = doc(db, "users", user.uid, "data", "prefs");
    setDoc(ref, { theme }, { merge: true }).catch((e) =>
      console.error("Theme save failed:", e),
    );
  }, [theme, user]);

  const setTheme = useCallback((id: ThemeId) => setThemeState(id), []);

  return { theme, setTheme, themes: THEMES };
}
