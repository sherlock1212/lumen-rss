// Minimal helpers to run React hooks in tests without extra libraries.
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export function mount(ui: ReactElement): {
  root: Root;
  rerender: (ui: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
} {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  void act(() => root.render(ui));
  return {
    root,
    rerender: (next) => act(async () => root.render(next)),
    unmount: () => act(async () => root.unmount()),
  };
}

export const flush = (fn: () => void | Promise<void>) => act(async () => void (await fn()));
