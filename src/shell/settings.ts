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
  /** 是否已操作过关闭偏好；关窗「记住选择」仅首次默认勾选 */
  closePrefTouched: boolean;
  preferredPort: number;
  cliLinkEnabled: boolean;
  /** system：本机 npm 全局包；hosted：AppData 托管（legacy auto 由 Rust 迁移） */
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
  | "closePrefTouched"
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
    closePrefTouched: s.closePrefTouched,
    preferredPort: s.preferredPort,
    cliLinkEnabled: s.cliLinkEnabled,
    runtimeSource: s.runtimeSource,
    onboardingDone: s.onboardingDone,
  };
}

export function uiFromSettings(s: ShellSettings): UiSettings {
  return {
    titlebarCompact: s.titlebarCompact ?? false,
    selectionHygiene: s.selectionHygiene ?? true,
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
  closePrefTouched: false,
  preferredPort: 0,
  cliLinkEnabled: false,
  runtimeSource: "hosted",
  onboardingDone: false,
  shellTheme: "system",
  shellLocale: "zh",
  titlebarCompact: false,
  selectionHygiene: true,
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
    selectionHygiene: s.selectionHygiene ?? true,
    sessionLogInTitlebar: s.sessionLogInTitlebar ?? true,
  };
}

export function normalizeRuntimeSource(v: unknown): RuntimeSource {
  if (v === "system" || v === "hosted") return v;
  // legacy auto：前端兜底；真源迁移在 Rust settings::load
  if (v === "auto") return "hosted";
  return "hosted";
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
    // 旧配置无此字段：已锁定关闭偏好则视为操作过
    closePrefTouched: s?.closePrefTouched ?? s?.closePrefSet ?? false,
    preferredPort: Number.isFinite(port) && port >= 0 ? Math.floor(port) : 0,
    cliLinkEnabled: s?.cliLinkEnabled ?? false,
    runtimeSource: normalizeRuntimeSource(s?.runtimeSource),
    onboardingDone: s?.onboardingDone ?? false,
    shellTheme: normalizeShellTheme(s?.shellTheme),
    shellLocale: normalizeShellLocale(s?.shellLocale),
    titlebarCompact: s?.titlebarCompact ?? false,
    selectionHygiene: s?.selectionHygiene ?? true,
    sessionLogInTitlebar: s?.sessionLogInTitlebar ?? true,
  };
}

export const PLATFORM_URL = "https://platform.deepseek.com";
export const GITHUB_REPO_URL =
  "https://github.com/MidiAug/deepseek-harness-desktop";
