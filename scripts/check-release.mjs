#!/usr/bin/env node
/**
 * 发行前静态门禁：updater 配置、capabilities、壳更新杀树路径、
 * NODE_VERSION 与文档一致。
 * 用法：pnpm check:release
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    errors.push(`缺少文件: ${rel}`);
    return null;
  }
  return readFileSync(p, "utf8");
}

/** 可选读：文件可不存在（如 gitignore 的 `dev/`），不记错误 */
function readOptional(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

const confText = read("src-tauri/tauri.conf.json");
if (confText) {
  const conf = JSON.parse(confText);
  if (
    conf.productName !== "DeepSeek Harness Desktop" ||
    conf.mainBinaryName !== "deepseek-harness-desktop" ||
    conf.identifier !== "com.deepseek.harness.desktop"
  ) {
    errors.push(
      "tauri.conf.json 路径身份不一致（productName / mainBinaryName / identifier）",
    );
  }
  const nsis = conf?.bundle?.windows?.nsis ?? {};
  if (nsis.startMenuFolder !== "DeepSeek Harness") {
    errors.push("NSIS startMenuFolder 应为 DeepSeek Harness");
  }
  if (
    !Array.isArray(nsis.languages) ||
    !nsis.languages.includes("English") ||
    !nsis.languages.includes("SimpChinese")
  ) {
    errors.push("NSIS languages 须含 English 与 SimpChinese");
  }
  if (!String(nsis.installerHooks ?? "").includes("hooks.nsh")) {
    errors.push("NSIS installerHooks 须指向 hooks.nsh");
  }
  const updater = conf?.plugins?.updater ?? {};
  const pubkey = String(updater.pubkey ?? "").trim();
  if (!pubkey || pubkey.length < 32) {
    errors.push("tauri.conf.json plugins.updater.pubkey 缺失或过短");
  }
  const endpoints = updater.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    errors.push("tauri.conf.json plugins.updater.endpoints 为空");
  } else {
    for (const ep of endpoints) {
      if (String(ep).includes("OWNER") || String(ep).includes("example.com")) {
        errors.push(`updater endpoint 仍为占位: ${ep}`);
      }
    }
  }
  if (conf?.bundle?.createUpdaterArtifacts !== true) {
    errors.push("bundle.createUpdaterArtifacts 应为 true");
  }
}

const capsText = read("src-tauri/capabilities/default.json");
if (capsText) {
  const caps = JSON.parse(capsText);
  const perms = caps.permissions ?? [];
  for (const need of ["updater:default", "process:default"]) {
    if (!perms.includes(need)) {
      errors.push(`capabilities 缺少 ${need}`);
    }
  }
}

const provider = read("src/shell/contexts/ShellUpdateProvider.tsx");
if (provider) {
  if (!provider.includes("prepareShellUpdate")) {
    errors.push("ShellUpdateProvider 未调用 prepareShellUpdate（壳更新前须杀树）");
  }
  if (!/await\s+prepareShellUpdate\s*\(/.test(provider)) {
    errors.push("installAndRelaunch 须 await prepareShellUpdate()");
  }
}

const libRs = read("src-tauri/src/lib.rs");
if (libRs) {
  if (!libRs.includes("prepare_shell_update")) {
    errors.push("lib.rs 缺少 prepare_shell_update 命令");
  }
  if (!libRs.includes("tauri_plugin_single_instance")) {
    errors.push("lib.rs 未注册 tauri_plugin_single_instance");
  }
}

const hooksNsh = read("src-tauri/installer/windows/hooks.nsh");
if (hooksNsh) {
  const need = [
    "DeepSeek Harness 桌面版.lnk",
    "SetLnkAppUserModelId",
    "NSIS_HOOK_PREINSTALL",
    "FindFirst",
  ];
  for (const token of need) {
    if (!hooksNsh.includes(token)) {
      errors.push(`hooks.nsh 缺少 B50 关键片段: ${token}`);
    }
  }
}

const pathsRs = read("src-tauri/src/paths.rs");
if (pathsRs) {
  const nodeMatch = pathsRs.match(
    /pub const NODE_VERSION:\s*&str\s*=\s*"([^"]+)"/,
  );
  if (!nodeMatch) {
    errors.push("paths.rs 缺少 pub const NODE_VERSION");
  } else {
    const version = nodeMatch[1];
    const docSources = ["docs/releases.md", "dev/maintainer-release.md"];
    let docVersion = null;
    for (const src of docSources) {
      // docs/ 必有；dev/ 本地可选（公开仓 gitignore 不上传）
      const text = src.startsWith("dev/") ? readOptional(src) : read(src);
      if (!text) continue;
      const explicit = text.match(/NODE_VERSION:\s*(v[\d.]+)/);
      const inline = text.match(/\*\*Node (v[\d.]+)\*\*/);
      docVersion = explicit?.[1] ?? inline?.[1] ?? null;
      if (docVersion) break;
    }
    if (!docVersion) {
      errors.push("docs/releases.md 缺少 Node 版本说明（**Node vX.Y.Z**）");
    } else if (version !== docVersion) {
      errors.push(
        `NODE_VERSION 不一致: paths.rs=${version} docs=${docVersion}`,
      );
    }
  }
}

if (errors.length) {
  console.error("check:release FAILED\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("check:release OK");
