/**
 * Theme.
 *
 * Three states: light, dark, or "follow the system". The choice is persisted under
 * the same key read by the inline script in index.html, so the very first paint is
 * already correct and the page never flashes.
 */

import { create } from "zustand";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "chatapp.theme";

type ThemeState = {
  preference: ThemePreference;
  /** What is actually on screen right now, after resolving "system". */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → system, for the single toggle button. */
  cycle: () => void;
};

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Blocked storage falls back to following the system.
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolve(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return systemPrefersDark() ? "dark" : "light";
  }
  return preference;
}

function applyToDocument(resolved: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

const initial = readStoredPreference();
applyToDocument(resolve(initial));

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initial,
  resolved: resolve(initial),

  setPreference: (preference) => {
    const resolved = resolve(preference);
    applyToDocument(resolved);
    try {
      if (preference === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // The theme still applies for this session even if it cannot be saved.
    }
    set({ preference, resolved });
  },

  cycle: () => {
    const current = get().preference;
    const next: ThemePreference = current === "light" ? "dark" : current === "dark" ? "system" : "light";
    get().setPreference(next);
  },
}));

// Follow the system while the preference is "system".
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useThemeStore.getState().preference !== "system") {
      return;
    }
    const resolved = resolve("system");
    applyToDocument(resolved);
    useThemeStore.setState({ resolved });
  });
}
