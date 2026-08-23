#!/usr/bin/env node
/**
 * 审计：退出后托管进程是否回收（需应用已运行且 CDP 可用）。
 * 临时将 closeToTray=false 后通过 CDP 点击关闭钮触发 RunEvent::Exit。
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const appData = join(process.env.APPDATA, "com.deepseek.harness.desktop");
const settingsPath = join(appData, "settings.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function harnessPids() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name=\'node.exe\'\\" | Where-Object { $_.CommandLine -match \'com.deepseek.harness.desktop\\\\harness\' } | Select-Object -ExpandProperty ProcessId"',
      { encoding: "utf8" },
    ).trim();
    return out ? out.split(/\s+/).map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function getTargets() {
  return new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      })
      .on("error", reject);
  });
}

async function cdpClickClose() {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no CDP page");
  const wsUrl = page.webSocketDebuggerUrl;

  const box = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: {
            expression: `
              (() => {
                const btn = document.querySelector('.win-close');
                if (!btn) return JSON.stringify({ error: 'no close button' });
                const r = btn.getBoundingClientRect();
                return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
              })()
            `,
            returnByValue: true,
          },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        const raw = msg.result?.result?.value;
        ws.close();
        if (!raw) reject(new Error("no box"));
        else resolve(JSON.parse(raw));
      }
    });
    setTimeout(() => reject(new Error("box timeout")), 10000);
  });

  if (box.error) throw new Error(box.error);

  await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let step = 0;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id: 2,
          method: "Input.dispatchMouseEvent",
          params: {
            type: "mousePressed",
            x: box.x,
            y: box.y,
            button: "left",
            clickCount: 1,
          },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 2 && step === 0) {
        step = 1;
        ws.send(
          JSON.stringify({
            id: 3,
            method: "Input.dispatchMouseEvent",
            params: {
              type: "mouseReleased",
              x: box.x,
              y: box.y,
              button: "left",
              clickCount: 1,
            },
          }),
        );
      } else if (msg.id === 3) {
        ws.close();
        resolve(undefined);
      }
    });
    setTimeout(() => reject(new Error("click timeout")), 10000);
  });
}

const settingsBackup = readFileSync(settingsPath, "utf8");
const settings = JSON.parse(settingsBackup);
settings.closeToTray = false;
settings.closePrefSet = true;
writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");

const beforeHarness = harnessPids();
const beforeShell = execSync(
  'tasklist /FI "IMAGENAME eq deepseek-harness-desktop.exe" /NH',
  { encoding: "utf8" },
).trim();

let clickOk = false;
let clickErr = null;
try {
  await cdpClickClose();
  clickOk = true;
} catch (e) {
  clickErr = String(e);
}

await sleep(4000);

const afterHarness = harnessPids();
const afterShell = execSync(
  'tasklist /FI "IMAGENAME eq deepseek-harness-desktop.exe" /NH',
  { encoding: "utf8" },
).trim();

writeFileSync(settingsPath, settingsBackup, "utf8");

const result = {
  timestamp: new Date().toISOString(),
  scenario: "quit-via-close-button",
  settingsDuringTest: { closeToTray: false, closePrefSet: true },
  clickOk,
  clickErr,
  before: { harnessPids: beforeHarness, shell: beforeShell },
  after: { harnessPids: afterHarness, shell: afterShell },
  harnessCleaned: beforeHarness.length > 0 && afterHarness.length === 0,
  shellExited: !afterShell.includes("deepseek-harness-desktop"),
};

mkdirSync(outDir, { recursive: true });
const stamp = result.timestamp.replace(/[:.]/g, "-");
const outPath = join(outDir, `quit-cleanup-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify({ outPath, result }, null, 2));
