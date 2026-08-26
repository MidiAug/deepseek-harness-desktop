import assert from "node:assert/strict";
import test from "node:test";
import { resolveBootProgressDisplay } from "./bootProgressDisplay.ts";

const t = (key: string, params?: Record<string, string>) => {
  if (key === "boot.progress.downloadNode") return "正在下载 Node.js";
  if (key === "boot.progress.downloadPct") return `${params?.pct}%`;
  if (key === "boot.progress.installDsh") return "正在安装 Harness";
  if (key === "boot.progress.installHint") return "首次通常需数分钟";
  if (key === "boot.progress.elapsedSec") return `已 ${params?.n} 秒`;
  return key;
};

test("download bytes map to percent headline", () => {
  const d = resolveBootProgressDisplay({
    stageId: "download-node",
    message: "下载中 17778426/35556852 字节",
    percent: 25,
    stageLabel: "下载 Node",
    t,
  });
  assert.equal(d.headline, "正在下载 Node.js");
  assert.equal(d.detail, "25%");
});

test("npm heartbeat maps to friendly install copy", () => {
  const d = resolveBootProgressDisplay({
    stageId: "install-dsh",
    message: "npm install 进行中（已 51s，通常需数分钟）…",
    percent: 75,
    stageLabel: "安装 harness",
    t,
  });
  assert.equal(d.headline, "正在安装 Harness");
  assert.equal(d.detail, "首次通常需数分钟");
  assert.equal(d.elapsed, "已 51 秒");
});

test("npm log noise does not become headline", () => {
  const d = resolveBootProgressDisplay({
    stageId: "install-dsh",
    message: "npm info using node@v22.22.0",
    percent: 75,
    stageLabel: "安装 harness",
    t,
  });
  assert.equal(d.headline, "正在安装 Harness");
});
