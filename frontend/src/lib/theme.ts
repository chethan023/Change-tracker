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

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{3,6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Apply a brand hex colour to all accent-derived CSS custom properties on
 * <html>. Inline styles have higher specificity than any stylesheet rule so
 * they override both light and dark theme defaults without needing !important.
 * Pass null/undefined to remove the overrides and revert to CSS defaults.
 */
export function applyBrandColour(hex: string | null | undefined) {
  const root = document.documentElement;
  const PROPS = [
    "--accent", "--accent-hover", "--accent-press",
    "--accent-soft", "--accent-border", "--focus-ring",
  ];

  if (!hex) {
    PROPS.forEach((p) => root.style.removeProperty(p));
    return;
  }

  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const { r, g, b } = rgb;

  root.style.setProperty("--accent",        hex);
  root.style.setProperty("--accent-hover",  hex);
  root.style.setProperty("--accent-press",  hex);
  root.style.setProperty("--accent-soft",   `rgba(${r},${g},${b},0.14)`);
  root.style.setProperty("--accent-border", `rgba(${r},${g},${b},0.45)`);
  root.style.setProperty("--focus-ring",    `0 0 0 4px rgba(${r},${g},${b},0.25)`);
}
