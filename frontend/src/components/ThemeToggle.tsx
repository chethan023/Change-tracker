import { Moon, Sun } from "lucide-react";
import { useTheme } from "../lib/theme";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
      className={
        "inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider " +
        "text-ink/60 hover:text-ink transition " +
        (compact ? "" : "border border-ink/20 px-2 py-1 hover:bg-ink/5")
      }
    >
      {isDark ? <Sun size={12} aria-hidden /> : <Moon size={12} aria-hidden />}
      <span>{isDark ? "light" : "dark"}</span>
    </button>
  );
}
