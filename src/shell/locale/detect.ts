import type { ShellLocale } from "./types";

/** 对齐 DSH `detectBrowserLocale`：primary subtag 匹配 zh / en。 */
export function detectBrowserLocale(): ShellLocale {
  if (typeof window === "undefined") return "en";
  for (const tag of [...(navigator.languages ?? []), navigator.language]) {
    const primary = tag.toLowerCase().split("-")[0];
    if (primary === "zh") return "zh";
    if (primary === "en") return "en";
  }
  return "en";
}

export function prefToLocale(pref: string): ShellLocale | null {
  if (pref === "zh" || pref === "en") return pref;
  return null;
}

export function normalizeShellLocale(v: unknown): ShellLocale {
  if (v === "zh" || v === "en") return v;
  return detectBrowserLocale();
}
