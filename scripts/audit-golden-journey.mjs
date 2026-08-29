#!/usr/bin/env node
/**
 * B64/B66/B67 黄金旅程：CDP 硬断言（需 debug 应用 + :9222）。
 *
 *   J1-cold-ready — ready + 探活 + token 兼容 + 二次抽检
 *   J2-kill-recover — 杀托管 harness node → 失活 → restart_harness → 再 ready
 *
 * 用法：WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm tauri dev
 *       pnpm check:host:live
 */
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const POLL_MS = 2000;
const READY_TIMEOUT_MS = 60_000;
const STABLE_WAIT_MS = 3000;
const RECOVER_TIMEOUT_MS = 90_000;

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

function hasLaunchToken(url) {
  if (!url || typeof url !== "string") return false;
  return url.includes("?token=") || url.includes("&token=");
}

/** 杀本壳 AppData harness 下的 node（故障注入；勿用于生产脚本照搬）。 */
function killHarnessNodes() {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$procs = Get-CimInstance Win32_Process -Filter \\"name='node.exe'\\" | Where-Object { $_.CommandLine -match 'com\\.deepseek\\.harness\\.desktop\\\\\\\\harness' }; $ids = @($procs | ForEach-Object { $_.ProcessId }); foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }; $ids | ConvertTo-Json -Compress"`,
      { encoding: "utf8" },
    ).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
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

const RESTART_EXPR = `
(async () => {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return { error: "no invoke" };
  try {
    const ready = await invoke("restart_harness", { opId: "j2-fault-recover" });
    return { ok: true, ready };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
})()
`;

const report = {
  timestamp: new Date().toISOString(),
  catalog: [
    {
      id: "J1-cold-ready",
      meaning: "ready + no fault + iframe probe + token-compat + stable recheck",
    },
    {
      id: "J2-kill-recover",
      meaning: "kill hosted node → unhealthy → restart_harness → ready again",
    },
  ],
  journeys: [],
};

function record(id, ok, detail) {
  report.journeys.push({ id, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${id}`, detail ?? "");
  return ok;
}

async function waitReady(wsUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await cdpEval(wsUrl, AUDIT_EXPR);
    if (snap?.sessionPhase === "ready" && snap?.loopbackHealthy === true) {
      return snap;
    }
    await sleep(POLL_MS);
  }
  return snap;
}

let failed = false;

try {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === "page");
  if (!record("J1.cdp-reachable", !!page, page ? page.url : "no page target")) {
    failed = true;
  } else {
    const wsUrl = page.webSocketDebuggerUrl;
    let snap = await waitReady(wsUrl, READY_TIMEOUT_MS);

    if (
      !record("J1.session-ready", snap?.sessionPhase === "ready", {
        sessionPhase: snap?.sessionPhase,
        onboardingGate: snap?.onboardingGate,
      })
    ) {
      failed = true;
    }
    if (!record("J1.no-boot-fault", snap?.bootFault == null, snap?.bootFault)) {
      failed = true;
    }
    if (
      !record("J1.iframe-present", !!snap?.harnessIframeSrc, snap?.harnessIframeSrc)
    ) {
      failed = true;
    }

    const iframeSrc = snap?.harnessIframeSrc ?? null;
    const tokenPresent = hasLaunchToken(iframeSrc);
    if (
      !record("J1.loopback-healthy", snap?.loopbackHealthy === true, {
        probeUrl: snap?.probeUrl,
        loopbackHealthy: snap?.loopbackHealthy,
        tokenPresent,
      })
    ) {
      failed = true;
    }
    record("J1.token-compat", true, {
      tokenPresent,
      note: tokenPresent
        ? "0.1.2+ auth URL retained in iframe"
        : "legacy bare URL (rc.2-compatible)",
    });

    await sleep(STABLE_WAIT_MS);
    const snap2 = await cdpEval(wsUrl, AUDIT_EXPR);
    if (
      !record(
        "J1.stable-ready",
        snap2?.sessionPhase === "ready" && snap2?.bootFault == null,
        {
          sessionPhase: snap2?.sessionPhase,
          bootFault: snap2?.bootFault,
        },
      )
    ) {
      failed = true;
    }
    report.journeys.push({
      id: "J1-cold-ready",
      ok: !failed,
      detail: "aggregate of J1.* steps",
    });

    // --- J2: 杀进程 → 失活 → restart ---
    let j2Failed = failed;
    if (!j2Failed) {
      const killed = killHarnessNodes();
      if (
        !record("J2.kill-injected", killed.length > 0, {
          killedPids: killed,
        })
      ) {
        j2Failed = true;
      } else {
        await sleep(1500);
        const deadSnap = await cdpEval(wsUrl, AUDIT_EXPR);
        const dead =
          deadSnap?.loopbackHealthy !== true ||
          deadSnap?.sessionPhase !== "ready";
        if (
          !record("J2.after-kill-unhealthy", dead, {
            sessionPhase: deadSnap?.sessionPhase,
            loopbackHealthy: deadSnap?.loopbackHealthy,
            bootFault: deadSnap?.bootFault,
          })
        ) {
          j2Failed = true;
        }

        const restart = await cdpEval(wsUrl, RESTART_EXPR);
        if (
          !record("J2.restart-invoked", restart?.ok === true, restart)
        ) {
          j2Failed = true;
        } else {
          const recovered = await waitReady(wsUrl, RECOVER_TIMEOUT_MS);
          if (
            !record(
              "J2.recovered-ready",
              recovered?.sessionPhase === "ready" &&
                recovered?.loopbackHealthy === true,
              {
                sessionPhase: recovered?.sessionPhase,
                loopbackHealthy: recovered?.loopbackHealthy,
                bootFault: recovered?.bootFault,
              },
            )
          ) {
            j2Failed = true;
          }
        }
      }
    } else {
      record("J2.skipped", false, "J1 failed; skip kill-recover");
      j2Failed = true;
    }

    report.journeys.push({
      id: "J2-kill-recover",
      ok: !j2Failed,
      detail: "aggregate of J2.* steps",
    });
    if (j2Failed) failed = true;

    report.finalSnapshot = await cdpEval(wsUrl, AUDIT_EXPR);
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
