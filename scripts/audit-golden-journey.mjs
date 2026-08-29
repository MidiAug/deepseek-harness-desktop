#!/usr/bin/env node
/**
 * B64 黄金旅程：CDP 硬断言（需 debug 应用 + :9222）。
 * 用法：WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri dev
 *       pnpm audit:journey
 */
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const POLL_MS = 2000;
const READY_TIMEOUT_MS = 60_000;

function getTargets() {
  return new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(JSON.parse(data)));
      })
      .on("error", reject);
  });
}

function cdpEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const id = 1;
    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: true },
        }),
      );
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.close();
        if (msg.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
        } else {
          resolve(msg.result?.result?.value);
        }
      }
    });
    ws.addEventListener("error", reject);
    setTimeout(() => reject(new Error("CDP timeout")), 20_000);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const AUDIT_EXPR = `
(async () => {
  const snap = window.__dshShellAudit?.();
  if (!snap) return { error: "no __dshShellAudit" };
  const invoke = window.__TAURI__?.core?.invoke;
  let loopbackHealthy = null;
  const port = snap.port;
  const url =
    snap.harnessIframeSrc ||
    (port ? "http://127.0.0.1:" + port + "/" : null);
  if (invoke && url) {
    try {
      loopbackHealthy = await invoke("probe_harness_url", { url });
    } catch (e) {
      loopbackHealthy = String(e);
    }
  }
  return { ...snap, loopbackHealthy, probeUrl: url };
})()
`;

const report = {
  timestamp: new Date().toISOString(),
  journeys: [],
};

function record(id, ok, detail) {
  report.journeys.push({ id, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${id}`, detail ?? "");
  return ok;
}

let failed = false;

try {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === "page");
  if (!record("cdp-reachable", !!page, page ? page.url : "no page target")) {
    failed = true;
  } else {
    const wsUrl = page.webSocketDebuggerUrl;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let snap = null;
    while (Date.now() < deadline) {
      snap = await cdpEval(wsUrl, AUDIT_EXPR);
      if (snap?.sessionPhase === "ready") break;
      await sleep(POLL_MS);
    }
    if (
      !record("session-ready", snap?.sessionPhase === "ready", {
        sessionPhase: snap?.sessionPhase,
        onboardingGate: snap?.onboardingGate,
      })
    ) {
      failed = true;
    }
    if (!record("no-boot-fault", snap?.bootFault == null, snap?.bootFault)) {
      failed = true;
    }
    if (
      !record("iframe-present", !!snap?.harnessIframeSrc, snap?.harnessIframeSrc)
    ) {
      failed = true;
    }
    if (
      !record("loopback-healthy", snap?.loopbackHealthy === true, {
        probeUrl: snap?.probeUrl,
        loopbackHealthy: snap?.loopbackHealthy,
      })
    ) {
      failed = true;
    }
    report.finalSnapshot = snap;
  }
} catch (e) {
  record("journey-error", false, String(e));
  failed = true;
}

mkdirSync(outDir, { recursive: true });
const stamp = report.timestamp.replace(/[:.]/g, "-");
const outPath = join(outDir, `golden-journey-${stamp}.json`);
writeFileSync(outPath, JSON.stringify({ outPath, ...report }, null, 2));
console.log(JSON.stringify({ outPath, failed, journeys: report.journeys }, null, 2));

process.exit(failed ? 1 : 0);
