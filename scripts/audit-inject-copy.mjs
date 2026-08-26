#!/usr/bin/env node
/**
 * 审计：在已开 CDP（9222）的 tauri 里核验 iframe 注入复制契约。
 *
 * 用法：
 *   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
 *   pnpm tauri dev
 *   # 打开一个有多段消息的聊天页
 *   pnpm audit:inject-copy
 *
 * 不依赖人工粘贴：在 iframe 内模拟选区 + 捕获阶段 clear 竞态，并读 clipboard API。
 */
import http from "node:http";

function getTargets() {
  return new Promise((resolve, reject) => {
    http
      .get("http://127.0.0.1:9222/json/list", (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", (e) =>
        reject(
          new Error(
            `CDP 9222 不可用（${e.message}）。请用 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 启动 tauri。`,
          ),
        ),
      );
  });
}

function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("open", () => resolve({ ws, pending, nextId: () => nextId++ }));
    ws.addEventListener("error", reject);
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
    setTimeout(() => reject(new Error("CDP connect timeout")), 15000);
  });
}

async function cdpCall(session, method, params = {}) {
  const id = session.nextId();
  const result = new Promise((resolve, reject) => {
    session.pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (session.pending.has(id)) {
        session.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 20000);
  });
  session.ws.send(JSON.stringify({ id, method, params }));
  return result;
}

async function cdpEval(session, expression) {
  const r = await cdpCall(session, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(JSON.stringify(r.exceptionDetails));
  }
  return r.result?.value;
}

const IFRAME_PROBE = `
(async () => {
  const frame = document.querySelector("iframe.harness-frame");
  if (!frame || !frame.contentWindow) return { ok: false, reason: "no-iframe" };
  const w = frame.contentWindow;
  const d = w.document;
  const segs = d.querySelectorAll("[data-chat-flow-kind]");
  if (!segs.length) return { ok: false, reason: "no-chat-segments", hint: "请先打开有消息的会话" };

  // Prefer injected select if present via synthetic Ctrl+A path is hard;
  // select first N message roots spanning multi-segment like shell does.
  const roots = [];
  segs.forEach((el) => {
    const kind = el.getAttribute("data-chat-flow-kind") || "";
    if (/^(user|assistant-step|tool-call|context|command)$/.test(kind)) roots.push(el);
  });
  if (roots.length < 2) return { ok: false, reason: "need-multi-segment", count: roots.length };

  const sel = w.getSelection();
  sel.removeAllRanges();
  const range = d.createRange();
  range.setStartBefore(roots[0]);
  range.setEndAfter(roots[roots.length - 1]);
  sel.addRange(range);
  const before = (sel.toString() || "").trim().length;
  if (before < 20) return { ok: false, reason: "selection-too-short", before };

  const marker = "DSH_INJECT_COPY_AUDIT_" + Date.now();
  await navigator.clipboard.writeText(marker);
  const stale = await navigator.clipboard.readText();

  // Simulate buggy sync-clear during copy capture
  let syncClipboard = null;
  {
    const s = w.getSelection();
    const t = (s.toString() || "").trim();
    s.removeAllRanges(); // sync clear before "default copy"
    syncClipboard = t; // what toast would claim
  }
  // Restore selection for real copy
  sel.removeAllRanges();
  sel.addRange(range);

  // Real path: execCommand copy WITHOUT clearing during event
  const ok = d.execCommand("copy");
  await new Promise((r) => setTimeout(r, 50));
  let after = "";
  try {
    after = await navigator.clipboard.readText();
  } catch (e) {
    return { ok: false, reason: "clipboard-read-denied", err: String(e) };
  }

  return {
    ok: ok && after.length >= before * 0.8 && after !== marker && after !== stale,
    beforeLen: before,
    afterLen: after.length,
    execOk: ok,
    unchanged: after === marker || after === stale,
    preview: after.slice(0, 80),
    segmentRoots: roots.length,
  };
})()
`;

async function main() {
  const targets = await getTargets();
  const page =
    targets.find((t) => t.url && t.url.includes("localhost:1420")) ||
    targets.find((t) => t.type === "page") ||
    targets[0];
  if (!page?.webSocketDebuggerUrl) {
    console.error("No CDP page target. targets=", targets.length);
    process.exit(1);
  }
  console.log("CDP target:", page.url || page.title);

  const session = await cdpSession(page.webSocketDebuggerUrl);
  try {
    await cdpCall(session, "Runtime.enable");
    const result = await cdpEval(session, IFRAME_PROBE);
    console.log(JSON.stringify(result, null, 2));
    if (!result?.ok) {
      console.error("\nFAIL: inject copy audit");
      process.exit(1);
    }
    console.log("\nok: multi-segment execCommand copy wrote clipboard");
  } finally {
    session.ws.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
