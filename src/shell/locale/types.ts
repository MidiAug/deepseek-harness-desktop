export type ShellLocale = "zh" | "en";

export const LOCALE_OPTIONS: { value: ShellLocale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

export const DOCUMENT_LANG: Record<ShellLocale, string> = {
  zh: "zh-CN",
  en: "en",
};
