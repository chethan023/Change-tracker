import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: prefersDark() ? "dark" : "light",
      toggle: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      set: (t) => set({ theme: t }),
    }),
    { name: "ct_theme" }
  )
);

/** Sync the <html> class so Tailwind's `dark:` variant + CSS vars flip. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
}
