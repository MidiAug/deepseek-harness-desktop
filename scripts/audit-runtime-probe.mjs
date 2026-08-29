#!/usr/bin/env node
/**
 * B37/B38 审计：本机 Node + 全局 @deepseek-ai/dsh 探测（对齐 system_runtime.rs）。
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function isIdeBundledNode(p) {
  const lower = p.toLowerCase();
  return (
    lower.includes("cursor") ||
    lower.includes("vscode") ||
    lower.includes("\\code\\") ||
    lower.includes("visual studio")
  );
}

function whereAll(cmd) {
  try {
    const out = execSync(`where.exe ${cmd}`, { encoding: "utf8" });
    return out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function npmGlobalNode() {
  const appdata = process.env.APPDATA;
  if (!appdata) return null;
  const node = join(appdata, "npm", "node.exe");
  return existsSync(node) ? node : null;
}

function globalDshEntry() {
  const appdata = process.env.APPDATA;
  if (!appdata) return null;
  const entry = join(
    appdata,
    "npm",
    "node_modules",
    "@deepseek-ai",
    "dsh",
    "lib",
    "bin.js",
  );
  return existsSync(entry) ? entry : null;
}

function resolveViaNode(node) {
  const script =
    "try{const p=require.resolve('@deepseek-ai/dsh/package.json');process.stdout.write(p)}catch(e){process.exit(1)}";
  try {
    const pkg = execSync(`"${node}" -e "${script}"`, {
      encoding: "utf8",
    }).trim();
    if (!pkg) return null;
    const entry = join(pkg, "..", "lib", "bin.js");
    return existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}

function nodeVersion(node) {
  try {
    return execSync(`"${node}" --version`, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function selectSystemNode(candidates) {
  const rejectedReasons = [];
  const npmNode = npmGlobalNode();
  if (npmNode) {
    return { selected: npmNode, reason: "npm-global-node.exe", rejectedReasons };
  }

  for (const node of candidates) {
    if (isIdeBundledNode(node)) {
      rejectedReasons.push({ node, reason: "ide-bundled" });
      continue;
    }
    if (resolveViaNode(node)) {
      return { selected: node, reason: "resolves-dsh", rejectedReasons };
    }
    rejectedReasons.push({ node, reason: "no-dsh-resolve" });
  }

  const fallback = candidates.find((n) => !isIdeBundledNode(n)) || candidates[0];
  if (fallback) {
    return {
      selected: fallback,
      reason: fallback ? "fallback-first-non-ide" : "none",
      rejectedReasons,
    };
  }
  return { selected: null, reason: "none", rejectedReasons };
}

const nodeCandidates = whereAll("node.exe");
if (nodeCandidates.length === 0) {
  nodeCandidates.push(...whereAll("node"));
}

const { selected: node, reason: selectedNodeReason, rejectedReasons } =
  selectSystemNode(nodeCandidates);

const globalEntry = globalDshEntry();
const resolvedEntry = node ? resolveViaNode(node) : null;
const entry = globalEntry || resolvedEntry;

const defaultDshHome = join(homedir(), ".dsh");

const report = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  nodeCandidates,
  rejectedReasons,
  selectedNode: node,
  selectedNodeReason,
  selectedNodeVersion: node ? nodeVersion(node) : null,
  globalDshEntry: globalEntry,
  resolvedDshEntry: resolvedEntry,
  activeEntry: entry,
  dshHomeDefault: defaultDshHome,
  dshHomeDetected: existsSync(defaultDshHome),
  systemRuntimeAvailable: Boolean(node && entry),
  scenarios: {
    auto: node && entry ? "system" : "hosted-fallback",
    system: node && entry ? "ok" : "error-no-system-runtime",
    hosted: "always-hosted",
  },
};

console.log(JSON.stringify(report, null, 2));

if (process.env.AUDIT_ASSERT === "1" && !report.systemRuntimeAvailable) {
  console.error("AUDIT_ASSERT: systemRuntimeAvailable is false");
  process.exit(1);
}
