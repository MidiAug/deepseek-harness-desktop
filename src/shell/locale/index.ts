export type { ShellLocale } from "./types";
export { LOCALE_OPTIONS, DOCUMENT_LANG } from "./types";
export { detectBrowserLocale, normalizeShellLocale, prefToLocale } from "./detect";
export { LocaleProvider, useLocale, useSectionLabels } from "./LocaleProvider";
export type { LocaleKey, LocaleDict } from "./dict";
