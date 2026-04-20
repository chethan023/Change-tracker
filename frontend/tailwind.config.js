/** @type {import('tailwindcss').Config} */
const withVar = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
        serif: ['"IBM Plex Serif"', "Georgia", "serif"],
      },
      colors: {
        ink: {
          DEFAULT: withVar("--c-ink"),
          50:  withVar("--c-ink-50"),
          100: withVar("--c-ink-100"),
          900: withVar("--c-ink-900"),
        },
        paper:   { DEFAULT: withVar("--c-paper"), 100: withVar("--c-paper-100") },
        surface: {
          DEFAULT: withVar("--c-surface"),
          100: withVar("--c-surface-100"),
          200: withVar("--c-surface-200"),
        },
        brand: {
          DEFAULT: withVar("--c-brand"),
          50:  withVar("--c-brand-50"),
          100: withVar("--c-brand-100"),
          900: withVar("--c-brand-900"),
        },
        amber: { DEFAULT: withVar("--c-amber"), 50: withVar("--c-amber-50"), 900: withVar("--c-amber-900") },
        rose:  { DEFAULT: withVar("--c-rose"),  50: withVar("--c-rose-50")  },
        sage:  { DEFAULT: withVar("--c-sage"),  50: withVar("--c-sage-50")  },
      },
      boxShadow: {
        "sharp": "4px 4px 0 0 rgb(var(--c-brand) / 0.6)",
        "soft":  "0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.12)",
        "lift":  "0 10px 40px -10px rgba(0,0,0,0.35)",
        "glow":  "0 0 24px -4px rgb(var(--c-brand) / 0.35)",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
