import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Short random id for tabs, widgets and bookmarks. */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
