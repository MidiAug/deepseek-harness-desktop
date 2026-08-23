#!/usr/bin/env node
/**
 * 审计用：通过 WebView2 CDP 抓取壳层 DOM 快照。
 * 用法：先开 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 的 tauri dev
 */
import http from "node:http";

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
    setTimeout(() => reject(new Error("CDP timeout")), 15000);
  });
}

const expr = `
(async () => {
  const invoke = window.__TAURI__?.core?.invoke;
  let runtime = null;
  let settings = null;
  try {
    if (invoke) {
      runtime = await invoke("get_runtime_status");
      settings = await invoke("get_shell_settings");
    }
  } catch (e) {
    runtime = String(e);
  }
  return JSON.stringify({
    url: location.href,
    title: document.title,
    locale: document.documentElement.lang,
    hasBootPanel: !!document.querySelector(".boot-panel"),
    hasSettingsModal: !!document.querySelector(".settings-modal"),
    hasClassicTitlebar: !!document.querySelector(".titlebar-classic"),
    hasCompactTitlebar: !!document.querySelector(".titlebar-compact"),
    iframeSrc: document.querySelector("iframe")?.src ?? null,
    visibleText: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1200),
    runtime,
    shellLocale: settings?.shellLocale ?? null,
    closeToTray: settings?.closeToTray ?? null,
    closePrefSet: settings?.closePrefSet ?? null,
  });
})()
`;

const targets = await getTargets();
const page = targets.find((t) => t.type === "page");
if (!page) {
  console.error("No CDP page target");
  process.exit(1);
}
const result = await cdpEval(page.webSocketDebuggerUrl, expr);
console.log(result);
