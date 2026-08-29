#!/usr/bin/env node
/**
 * 审计用：读取 AppData / 日志 / 进程快照（不依赖 UI）。
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const appData = join(
  process.env.APPDATA || "",
  "com.deepseek.harness.desktop",
);
const localLogs = join(
  process.env.LOCALAPPDATA || "",
  "com.deepseek.harness.desktop",
  "logs",
);
const currentLogs = join(localLogs, "current");

function tail(path, lines = 20) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

function dirSummary(path) {
  if (!existsSync(path)) return { exists: false };
  const entries = readdirSync(path).map((name) => {
    const p = join(path, name);
    const st = statSync(p);
    return { name, isDir: st.isDirectory(), size: st.size, mtime: st.mtime.toISOString() };
  });
  return { exists: true, entries };
}

let tasklist = "";
try {
  tasklist = execSync("tasklist", { encoding: "utf8" });
} catch {
  tasklist = "";
}

const harnessLines = tasklist
  .split(/\r?\n/)
  .filter((l) => /deepseek|node\.exe/i.test(l));

const snapshot = {
  timestamp: new Date().toISOString(),
  appData,
  settings: existsSync(join(appData, "settings.json"))
    ? JSON.parse(readFileSync(join(appData, "settings.json"), "utf8"))
    : null,
  ui: existsSync(join(appData, "ui.json"))
    ? JSON.parse(readFileSync(join(appData, "ui.json"), "utf8"))
    : null,
  windowState: existsSync(join(appData, ".window-state.json"))
    ? JSON.parse(readFileSync(join(appData, ".window-state.json"), "utf8"))
    : null,
  dirs: {
    runtime: dirSummary(join(appData, "runtime")),
    harness: dirSummary(join(appData, "harness")),
    logs: dirSummary(join(appData, "logs")),
  },
  logTail: {
    harness: tail(join(currentLogs, "harness.log")),
    shell: tail(join(currentLogs, "shell.log")),
  },
  processes: harnessLines,
  loopback3081: (() => {
    try {
      return execSync(
        "powershell -NoProfile -Command \"try { (Invoke-WebRequest -Uri http://127.0.0.1:3081/ -UseBasicParsing -TimeoutSec 5).StatusCode } catch { $_.Exception.Message }\"",
        { encoding: "utf8" },
      ).trim();
    } catch (e) {
      return String(e);
    }
  })(),
};

mkdirSync(outDir, { recursive: true });
const stamp = snapshot.timestamp.replace(/[:.]/g, "-");
const outPath = resolve(outDir, `system-snapshot-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log(JSON.stringify({ outPath, snapshot }, null, 2));
