// Theme list and the page-head boot script. No Firebase here: the root route imports it.

export type ThemeId = "ember" | "cyber" | "voltage" | "slate" | "daylight";

export const THEMES: { id: ThemeId; name: string; description: string }[] = [
  { id: "ember", name: "Ember", description: "Warm near-black, terracotta accents" },
  { id: "cyber", name: "Cyber Neon", description: "Black with neon magenta" },
  { id: "voltage", name: "Voltage", description: "Cyberpunk: acid yellow on blue-black" },
  { id: "slate", name: "Slate", description: "Medium dark, calm blue" },
  { id: "daylight", name: "Daylight", description: "Clean light theme" },
];

export const DEFAULT_THEME: ThemeId = "ember";

// The last theme is remembered on this device, so the page can be painted with the
// right colours immediately (the database answers a moment later). The same key is
// read by the small script in the page head (see themeBootScript).
export const THEME_STORAGE_KEY = "lumen:theme";

export function isTheme(x: unknown): x is ThemeId {
  return THEMES.some((t) => t.id === x);
}

/** Runs in the page head before the first paint. Keep it tiny and dependency free. */
export const themeBootScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES.map((x) => x.id))}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
