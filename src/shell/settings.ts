/** 壳设置前后端共用形状（camelCase 与 Rust serde 对齐）。 */

import { normalizeShellLocale } from "./locale/detect.ts";

export type MirrorKind = "domestic" | "official";
export type ProxyMode = "off" | "system" | "custom";
/** 与 DSH 相同：浅色 / 深色 / 跟随系统（真源 settings.yaml） */
export type ShellTheme = "light" | "dark" | "system";
/** 与 DSH 相同：zh / en（真源 settings.yaml → locale.preference） */
export type ShellLocale = "zh" | "en";
export type ResolvedTheme = "light" | "dark";

export type RuntimeSource = "auto" | "system" | "hosted";

export type ShellSettings = {
  mirror: MirrorKind;
  proxyMode: ProxyMode;
  proxyUrl: string;
  dshHomeOverride: string;
  closeToTray: boolean;
  closePrefSet: boolean;
  preferredPort: number;
  cliLinkEnabled: boolean;
  /** auto：本机可用则系统，否则托管 */
  runtimeSource: RuntimeSource;
  /** 首跑向导已完成 */
  onboardingDone: boolean;
  /** 自 DSH yaml 注入，不落 ui.json */
  shellTheme: ShellTheme;
  /** 自 DSH yaml 注入，不落 ui.json */
  shellLocale: ShellLocale;
  titlebarCompact: boolean;
  selectionHygiene: boolean;
  sessionLogInTitlebar: boolean;
};

export type ChromePrefs = {
  shellTheme: ShellTheme;
  titlebarCompact: boolean;
  selectionHygiene: boolean;
  sessionLogInTitlebar: boolean;
};

export type RuntimeSettings = Pick<
  ShellSettings,
  | "mirror"
  | "proxyMode"
  | "proxyUrl"
  | "dshHomeOverride"
  | "closeToTray"
  | "closePrefSet"
  | "preferredPort"
  | "cliLinkEnabled"
  | "runtimeSource"
  | "onboardingDone"
>;

/** ui.json（不含主题） */
export type UiSettings = Pick<
  ShellSettings,
  "titlebarCompact" | "selectionHygiene" | "sessionLogInTitlebar"
>;

export function runtimeFromSettings(s: ShellSettings): RuntimeSettings {
  return {
    mirror: s.mirror,
    proxyMode: s.proxyMode,
    proxyUrl: s.proxyUrl,
    dshHomeOverride: s.dshHomeOverride,
    closeToTray: s.closeToTray,
    closePrefSet: s.closePrefSet,
    preferredPort: s.preferredPort,
    cliLinkEnabled: s.cliLinkEnabled,
    runtimeSource: s.runtimeSource,
    onboardingDone: s.onboardingDone,
  };
}

export function uiFromSettings(s: ShellSettings): UiSettings {
  return {
    titlebarCompact: s.titlebarCompact ?? false,
    selectionHygiene: s.selectionHygiene ?? false,
    sessionLogInTitlebar: s.sessionLogInTitlebar ?? true,
  };
}

export const defaultShellSettings: ShellSettings = {
  mirror: "domestic",
  proxyMode: "off",
  proxyUrl: "",
  dshHomeOverride: "",
  closeToTray: true,
  closePrefSet: false,
  preferredPort: 0,
  cliLinkEnabled: false,
  runtimeSource: "auto",
  onboardingDone: false,
  shellTheme: "system",
  shellLocale: "zh",
  titlebarCompact: false,
  selectionHygiene: false,
  sessionLogInTitlebar: true,
};

export function normalizeShellTheme(v: unknown): ShellTheme {
  if (v === "light" || v === "dark" || v === "system") return v;
  if (v === "follow") return "system";
  if (v === "black" || v === "gray" || v === "transparent") return "dark";
  return "system";
}

export function chromeFromSettings(s: ShellSettings): ChromePrefs {
  return {
    shellTheme: normalizeShellTheme(s.shellTheme),
    titlebarCompact: s.titlebarCompact ?? false,
    selectionHygiene: s.selectionHygiene ?? false,
    sessionLogInTitlebar: s.sessionLogInTitlebar ?? true,
  };
}

export function normalizeRuntimeSource(v: unknown): RuntimeSource {
  if (v === "auto" || v === "system" || v === "hosted") return v;
  return "auto";
}

export function normalizeShellSettings(
  s: Partial<ShellSettings> | null | undefined,
): ShellSettings {
  const port = Number(s?.preferredPort ?? 0);
  return {
    ...defaultShellSettings,
    ...s,
    closeToTray: s?.closeToTray ?? true,
    closePrefSet: s?.closePrefSet ?? false,
    preferredPort: Number.isFinite(port) && port >= 0 ? Math.floor(port) : 0,
    cliLinkEnabled: s?.cliLinkEnabled ?? false,
    runtimeSource: normalizeRuntimeSource(s?.runtimeSource),
    onboardingDone: s?.onboardingDone ?? false,
    shellTheme: normalizeShellTheme(s?.shellTheme),
    shellLocale: normalizeShellLocale(s?.shellLocale),
    titlebarCompact: s?.titlebarCompact ?? false,
    selectionHygiene: s?.selectionHygiene ?? false,
    sessionLogInTitlebar: s?.sessionLogInTitlebar ?? true,
  };
}

export const PLATFORM_URL = "https://platform.deepseek.com";
