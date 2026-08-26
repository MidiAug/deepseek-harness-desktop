/**
 * 同步 Tauri WebView 原生底色（WebView2 导航/重载时默认白底，须与壳 canvas 一致）。
 * 创建窗口时 Rust 已设初值；此处负责主题切换与 reload 后对齐。
 */

import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { ResolvedTheme } from "./settings";
import { CANVAS_DARK, CANVAS_LIGHT } from "./themeBootstrap";

function rgbBytes(theme: ResolvedTheme): {
  red: number;
  green: number;
  blue: number;
  alpha: number;
} {
  const raw = theme === "light" ? CANVAS_LIGHT : CANVAS_DARK;
  const m = raw.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) {
    return theme === "light"
      ? { red: 245, green: 245, blue: 247, alpha: 255 }
      : { red: 21, green: 21, blue: 23, alpha: 255 };
  }
  return {
    red: Number(m[1]),
    green: Number(m[2]),
    blue: Number(m[3]),
    alpha: 255,
  };
}

/** 与 platform_window.rs canvas_color 对齐；非 Tauri 环境静默忽略。 */
export function syncWebviewCanvasColor(theme: ResolvedTheme): void {
  const color = rgbBytes(theme);
  void getCurrentWebviewWindow()
    .setBackgroundColor(color)
    .catch(() => undefined);
}
