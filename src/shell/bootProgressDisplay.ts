/**
 * 将后端 progress 原文映射为用户向文案；技术细节留在 boot-log。
 */

import type { LocaleKey } from "./locale";
import type { BootStageId } from "./hostProgressMap";

type TFn = (key: LocaleKey, params?: Record<string, string>) => string;

export type BootProgressDisplay = {
  headline: string;
  detail: string | null;
  elapsed: string | null;
};

const NPM_HEARTBEAT_RE =
  /^npm (?:install|全局安装) 进行中（已 (\d+)s，[^）]+）…$/;
const DOWNLOAD_BYTES_RE = /^下载中 (\d+)\/(\d+) 字节/;

function parseElapsedSecs(message: string): number | null {
  const m = message.match(NPM_HEARTBEAT_RE);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function formatElapsed(secs: number, t: TFn): string {
  if (secs < 60) {
    return t("boot.progress.elapsedSec", { n: String(secs) });
  }
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return t("boot.progress.elapsedMin", {
    m: String(m),
    s: String(s).padStart(2, "0"),
  });
}

function installHintForSecs(secs: number | null, t: TFn): string {
  if (secs == null || secs < 180) return t("boot.progress.installHint");
  if (secs < 600) return t("boot.progress.installHintMedium");
  if (secs < 1200) return t("boot.progress.installHintLong");
  return t("boot.progress.installHintVeryLong");
}

function isNpmNoiseLine(message: string): boolean {
  const t = message.trim();
  if (!t.startsWith("npm ")) return false;
  if (NPM_HEARTBEAT_RE.test(t)) return false;
  return true;
}

function downloadPercent(
  message: string,
  percent: number | null,
): number | null {
  if (percent != null && percent >= 5 && percent <= 44) return percent;
  const m = message.match(DOWNLOAD_BYTES_RE);
  if (!m) return percent;
  const written = Number(m[1]);
  const total = Number(m[2]);
  if (!Number.isFinite(written) || !Number.isFinite(total) || total <= 0) {
    return percent;
  }
  return Math.min(44, Math.max(5, Math.round((written / total) * 40) + 5));
}

/** 主文案区：阶段标题 + 一句说明 + 可选已等待时长。 */
export function resolveBootProgressDisplay(opts: {
  stageId: BootStageId | null;
  message: string;
  percent: number | null;
  stageLabel: string;
  t: TFn;
}): BootProgressDisplay {
  const { stageId, message, percent, stageLabel, t } = opts;
  const trimmed = message.trim();

  if (stageId === "download-node" && DOWNLOAD_BYTES_RE.test(trimmed)) {
    const pct = downloadPercent(trimmed, percent);
    return {
      headline: t("boot.progress.downloadNode"),
      detail:
        pct != null
          ? t("boot.progress.downloadPct", { pct: String(pct) })
          : t("boot.progress.downloadNodeHint"),
      elapsed: null,
    };
  }

  if (NPM_HEARTBEAT_RE.test(trimmed) || stageId === "install-dsh" && isNpmNoiseLine(trimmed)) {
    const secs = parseElapsedSecs(trimmed);
    return {
      headline: t("boot.progress.installDsh"),
      detail: installHintForSecs(secs, t),
      elapsed: secs != null ? formatElapsed(secs, t) : null,
    };
  }

  if (trimmed.startsWith("正在 npm install") || trimmed.includes("npm install @deepseek-ai/dsh")) {
    return {
      headline: t("boot.progress.installDsh"),
      detail: t("boot.progress.installHint"),
      elapsed: null,
    };
  }

  if (stageId === "start" && trimmed.includes("等待官方 UI")) {
    return {
      headline: t("boot.progress.startUi"),
      detail: t("boot.progress.startUiHint"),
      elapsed: null,
    };
  }

  // 后端已是友好句（如「正在下载 Node.js…」）则保留；否则回落到阶段名
  const friendly =
    trimmed.length > 0 &&
    !isNpmNoiseLine(trimmed) &&
    !DOWNLOAD_BYTES_RE.test(trimmed) &&
    !trimmed.startsWith("…");

  return {
    headline: friendly ? trimmed : stageLabel,
    detail: friendly ? null : t("boot.progress.stageWorking"),
    elapsed: null,
  };
}
