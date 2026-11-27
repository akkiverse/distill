import type { Theme } from "./types";

/** The browser bar colour for each look (AC-11.2); kept in step with --paper in styles.css and the inline script in index.html. */
export const BAR_COLOUR = { light: "#eef2f6", dark: "#070b12" } as const;

export const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function isTheme(v: unknown): v is Theme {
  return v === "system" || v === "light" || v === "dark";
}

function systemDark(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Which look is on screen for a choice: System follows the device (AC-11.1). */
export const resolved = (theme: Theme): "light" | "dark" => (theme === "system" ? (systemDark() ? "dark" : "light") : theme);

/**
 * AC-11.1, AC-11.2: put the choice on the page. An explicit choice sets `data-theme`, which the CSS tokens follow; System removes
 * it so the `prefers-color-scheme` rules apply. The browser bar colour follows too.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.style.colorScheme = theme === "system" ? "light dark" : theme;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const scheme = (m.getAttribute("media") ?? "").includes("dark") ? "dark" : "light";
    m.content = theme === "system" ? BAR_COLOUR[scheme] : BAR_COLOUR[theme];
  });
}
