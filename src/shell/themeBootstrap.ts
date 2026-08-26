/**
 * 首屏主题：在 React/CSS  bundle 就绪前同步 data-shell-theme，避免深色用户白闪。
 * 与 index.html 内联脚本共用 localStorage 键名。
 */

import type { ResolvedTheme, ShellTheme } from "./settings";

export const SHELL_THEME_CACHE_KEY = "dsh.shell.shellTheme";
export const RESOLVED_THEME_CACHE_KEY = "dsh.shell.resolvedTheme";

export const CANVAS_DARK = "rgb(21, 21, 23)";
export const CANVAS_LIGHT = "rgb(245, 245, 247)";

function osPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

export function resolveShellTheme(
  theme: ShellTheme,
  osDark = osPrefersDark(),
): ResolvedTheme {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return osDark ? "dark" : "light";
}

export function readCachedShellTheme(): ShellTheme {
  try {
    const v = localStorage.getItem(SHELL_THEME_CACHE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function readBootstrapResolvedTheme(): ResolvedTheme {
  try {
    const cached = localStorage.getItem(RESOLVED_THEME_CACHE_KEY);
    if (cached === "light" || cached === "dark") return cached;
  } catch {
    /* ignore */
  }
  return resolveShellTheme(readCachedShellTheme());
}

export function writeCachedThemes(
  shellTheme: ShellTheme,
  resolved: ResolvedTheme,
): void {
  try {
    localStorage.setItem(SHELL_THEME_CACHE_KEY, shellTheme);
    localStorage.setItem(RESOLVED_THEME_CACHE_KEY, resolved);
  } catch {
    /* ignore */
  }
}

/** 同步写 DOM；main.tsx 在 createRoot 前调用一次。 */
export function applyDomTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-shell-theme", theme);
  document.documentElement.style.colorScheme = theme;
  const canvas = theme === "light" ? CANVAS_LIGHT : CANVAS_DARK;
  document.documentElement.style.background = canvas;
  if (document.body) {
    document.body.style.background = canvas;
  }
  const root = document.getElementById("root");
  if (root) {
    root.style.background = canvas;
  }
}

export function bootstrapShellTheme(): ResolvedTheme {
  const theme = readBootstrapResolvedTheme();
  applyDomTheme(theme);
  return theme;
}

/** iframe src 附带 shellCanvas，供 inject/00-boot-canvas 首帧上色。 */
export function readCachedResolvedThemeForIframe(): ResolvedTheme {
  return readBootstrapResolvedTheme();
}
