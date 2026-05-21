import { useEffect, useState, useCallback } from "react";

export type ThemeId = "aurora" | "cyber" | "slate" | "daylight";

export const THEMES: { id: ThemeId; name: string; description: string }[] = [
  { id: "aurora", name: "Aurora", description: "Deep dark with mint glow" },
  { id: "cyber", name: "Cyber Neon", description: "Black with neon magenta" },
  { id: "slate", name: "Slate", description: "Medium dark, calm blue" },
  { id: "daylight", name: "Daylight", description: "Clean light theme" },
];

const STORAGE_KEY = "lumen-theme-v1";

function applyTheme(id: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", id);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "aurora";
    try {
      const raw = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (raw && THEMES.some((t) => t.id === raw)) return raw;
    } catch {}
    return "aurora";
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const setTheme = useCallback((id: ThemeId) => setThemeState(id), []);

  return { theme, setTheme, themes: THEMES };
}
