import { common as commonZh } from "./common.zh";
import { common as commonEn } from "./common.en";
import { settings as settingsZh } from "./settings.zh";
import { settings as settingsEn } from "./settings.en";
import { boot as bootZh } from "./boot.zh";
import { boot as bootEn } from "./boot.en";
import { titlebar as titlebarZh } from "./titlebar.zh";
import { titlebar as titlebarEn } from "./titlebar.en";
import { fault as faultZh } from "./fault.zh";
import { fault as faultEn } from "./fault.en";

export const zh = {
  ...commonZh,
  ...settingsZh,
  ...bootZh,
  ...titlebarZh,
  ...faultZh,
} as const;

export const en = {
  ...commonEn,
  ...settingsEn,
  ...bootEn,
  ...titlebarEn,
  ...faultEn,
} as const;

export type LocaleKey = keyof typeof zh;
export type LocaleDict = Record<LocaleKey, string>;

export const dicts: Record<"zh" | "en", LocaleDict> = { zh, en };
