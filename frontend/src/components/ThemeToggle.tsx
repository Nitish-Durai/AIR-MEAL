"use client";

import { useTheme } from "@/lib/theme-context";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 38,
        height: 38,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface-alt)",
        color: "var(--color-text)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
        transition: "background 0.2s, border-color 0.2s",
      }}
    >
      {dark ? "☀" : "☾"}
    </button>
  );
}
