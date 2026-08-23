#!/usr/bin/env node
/**
 * 发行前静态门禁（B13 + B19）：updater 配置、capabilities、壳更新杀树路径、
 * NODE_VERSION 与文档一致（B19 Node 门禁）。
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

const confText = read("src-tauri/tauri.conf.json");
if (confText) {
  const conf = JSON.parse(confText);
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

const pathsRs = read("src-tauri/src/paths.rs");
const releasesMd = read("docs/releases.md");
if (pathsRs && releasesMd) {
  const nodeMatch = pathsRs.match(
    /pub const NODE_VERSION:\s*&str\s*=\s*"([^"]+)"/,
  );
  const docMatch = releasesMd.match(/NODE_VERSION:\s*(v[\d.]+)/);
  if (!nodeMatch) {
    errors.push("paths.rs 缺少 pub const NODE_VERSION");
  } else if (!docMatch) {
    errors.push("docs/releases.md 缺少 NODE_VERSION: 行（check:release 断言）");
  } else if (nodeMatch[1] !== docMatch[1]) {
    errors.push(
      `NODE_VERSION 不一致: paths.rs=${nodeMatch[1]} docs/releases.md=${docMatch[1]}`,
    );
  }
}

if (errors.length) {
  console.error("check:release FAILED\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("check:release OK");
