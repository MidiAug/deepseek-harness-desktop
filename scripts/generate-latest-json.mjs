#!/usr/bin/env node
/**
 * 从已签名的 NSIS 安装包生成 GitHub Release 用 latest.json。
 * 用法：node scripts/generate-latest-json.mjs [version] [tag]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2] ?? "0.1.0";
const tag = process.argv[3] ?? `v${version}`;
const repo = "MidiAug/deepseek-harness-desktop";

const nsisDir = resolve(root, "src-tauri/target/release/bundle/nsis");
const setupName = readdirSync(nsisDir).find((f) => f.endsWith("-setup.exe"));
if (!setupName) {
  console.error("缺少 NSIS *-setup.exe，请先 pnpm tauri build");
  process.exit(1);
}

const setup = join(nsisDir, setupName);
const sigPath = `${setup}.sig`;
if (!existsSync(sigPath)) {
  console.error("缺少 .sig，请先签名");
  process.exit(1);
}

const signature = readFileSync(sigPath, "utf8").trim();
const url = `https://github.com/${repo}/releases/download/${tag}/${setupName}`;

const latest = {
  version,
  notes: `deepseek-harness-desktop ${version} — Windows x64`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url },
  },
};

const out = resolve(root, "latest.json");
writeFileSync(out, `${JSON.stringify(latest, null, 2)}\n`);
console.log(`Wrote ${out}`);
