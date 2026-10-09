"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { THEME_KEY } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const getTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice just won't persist.
  }
  listeners.forEach((fn) => fn());
}

export function ThemeToggle({ className }: { className?: string }) {
  // null on the server: the icon renders after hydration, once the real theme is known.
  const theme = useSyncExternalStore(subscribe, getTheme, () => null);
  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={theme ? `Switch to ${next} mode` : "Toggle theme"}
      title={theme ? `Switch to ${next} mode` : undefined}
      className={cn(
        "press grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-white/5 hover:text-text",
        className,
      )}
    >
      {theme === "light" ? <Moon className="size-4" /> : theme === "dark" ? <Sun className="size-4" /> : null}
    </button>
  );
}
