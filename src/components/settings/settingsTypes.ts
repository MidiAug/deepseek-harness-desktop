export type SettingsSection =
  | "network"
  | "window"
  | "appearance"
  | "runtime"
  | "data"
  | "about";

export const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "network", label: "网络" },
  { id: "window", label: "窗口" },
  { id: "appearance", label: "外观" },
  { id: "runtime", label: "运行时" },
  { id: "data", label: "数据与诊断" },
  { id: "about", label: "关于" },
];

export const MIRROR_OPTIONS = [
  { value: "domestic", label: "国内（npmmirror）" },
  { value: "official", label: "官方（nodejs.org / npmjs）" },
];

export const PROXY_OPTIONS = [
  { value: "off", label: "关闭（直连）" },
  { value: "system", label: "系统代理" },
  { value: "custom", label: "自定义 URL" },
];
