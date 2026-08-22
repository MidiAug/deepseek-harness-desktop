/** 壳设置前后端共用形状（camelCase 与 Rust serde 对齐）。 */

export type MirrorKind = "domestic" | "official";
export type ProxyMode = "off" | "system" | "custom";
export type TitlebarStyle = "black" | "gray";

export type ShellSettings = {
  mirror: MirrorKind;
  proxyMode: ProxyMode;
  proxyUrl: string;
  dshHomeOverride: string;
  closeToTray: boolean;
  closePrefSet: boolean;
  /** 0 = 壳默认端口；占用则顺延 */
  preferredPort: number;
  cliLinkEnabled: boolean;
  titlebarStyle: TitlebarStyle;
  titlebarCompact: boolean;
  /** 减少误选界面文字（默认关） */
  selectionHygiene: boolean;
  /** 简洁模式：隐藏官方 Session log，顶栏代理下载（默认开） */
  sessionLogInTitlebar: boolean;
};

export type ChromePrefs = {
  titlebarStyle: TitlebarStyle;
  titlebarCompact: boolean;
  selectionHygiene: boolean;
  sessionLogInTitlebar: boolean;
};

/** 运行时域（settings.json） */
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
>;

/** UI chrome（ui.json） */
export type UiSettings = Pick<
  ShellSettings,
  | "titlebarStyle"
  | "titlebarCompact"
  | "selectionHygiene"
  | "sessionLogInTitlebar"
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
  };
}

export function uiFromSettings(s: ShellSettings): UiSettings {
  return {
    titlebarStyle: normalizeTitlebarStyle(s.titlebarStyle),
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
  titlebarStyle: "black",
  titlebarCompact: false,
  selectionHygiene: false,
  sessionLogInTitlebar: true,
};

/** 旧版曾有 transparent；并入 black */
function normalizeTitlebarStyle(v: unknown): TitlebarStyle {
  return v === "gray" ? "gray" : "black";
}

export function chromeFromSettings(s: ShellSettings): ChromePrefs {
  return {
    titlebarStyle: normalizeTitlebarStyle(s.titlebarStyle),
    titlebarCompact: s.titlebarCompact ?? false,
    selectionHygiene: s.selectionHygiene ?? false,
    sessionLogInTitlebar: s.sessionLogInTitlebar ?? true,
  };
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
    titlebarStyle: normalizeTitlebarStyle(s?.titlebarStyle),
    titlebarCompact: s?.titlebarCompact ?? false,
    selectionHygiene: s?.selectionHygiene ?? false,
    sessionLogInTitlebar: s?.sessionLogInTitlebar ?? true,
  };
}

export const PLATFORM_URL = "https://platform.deepseek.com";
