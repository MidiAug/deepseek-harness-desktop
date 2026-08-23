#!/usr/bin/env node
/**
 * 审计用：CDP 抓取壳层 DOM（不依赖 __TAURI__ 全局）。
 */
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");

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

function cdp(wsUrl, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === id) {
        ws.close();
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
    ws.addEventListener("error", reject);
    setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), 20000);
  });
}

async function cdpEval(wsUrl, expression) {
  const r = await cdp(wsUrl, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails));
  }
  return r.result?.value;
}

const DOM_EXPR = `
(() => {
  const pick = (sel) => Array.from(document.querySelectorAll(sel)).map(el => ({
    tag: el.tagName,
    class: el.className,
    text: (el.innerText || el.textContent || "").trim().slice(0, 200),
    aria: el.getAttribute("aria-label"),
  }));
  return JSON.stringify({
    url: location.href,
    lang: document.documentElement.lang,
    title: document.title,
    flags: {
      bootPanel: !!document.querySelector(".boot-panel"),
      settingsModal: !!document.querySelector(".settings-modal"),
      closeAsk: !!document.querySelector(".close-ask-dialog"),
      updateBanner: !!document.querySelector(".shell-update-banner"),
      classicTitlebar: !!document.querySelector(".titlebar-classic"),
      compactTitlebar: !!document.querySelector(".titlebar-compact"),
      progressBubble: !!document.querySelector(".shell-progress-bubble"),
    },
    iframeSrc: document.querySelector("iframe")?.src ?? null,
    titlebarTexts: pick(".titlebar-classic button, .titlebar-classic .titlebar-menu-trigger, .titlebar-classic .titlebar-status, .titlebar-compact button, .titlebar-compact [aria-label]"),
    tooltips: pick("[aria-label]"),
    bodyText: document.body.innerText.replace(/\\s+/g, " ").trim().slice(0, 1500),
  });
})()
`;

const targets = await getTargets();
const page = targets.find((t) => t.type === "page");
if (!page) {
  console.error("No CDP page target on 9222");
  process.exit(1);
}

const wsUrl = page.webSocketDebuggerUrl;
const dom = JSON.parse(await cdpEval(wsUrl, DOM_EXPR));

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(outDir, `cdp-dom-${stamp}.json`);
writeFileSync(outPath, JSON.stringify(dom, null, 2), "utf8");

const shot = await cdp(wsUrl, "Page.captureScreenshot", { format: "png" });
const pngPath = resolve(outDir, `cdp-screenshot-${stamp}.png`);
writeFileSync(pngPath, Buffer.from(shot.data, "base64"));

console.log(JSON.stringify({ outPath, pngPath, dom }, null, 2));
