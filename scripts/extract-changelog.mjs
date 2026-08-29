#!/usr/bin/env node
/**
 * 从 CHANGELOG.md 提取指定版本章节，拼成 GitHub Release 正文。
 * 用法：
 *   node scripts/extract-changelog.mjs 0.1.1
 *   node scripts/extract-changelog.mjs v0.1.1
 *   node scripts/extract-changelog.mjs 0.1.1 --github-output  # 写入 GITHUB_OUTPUT body
 */
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const changelogPath = resolve(root, "CHANGELOG.md");

const rawArg = process.argv[2];
const githubOutput = process.argv.includes("--github-output");

if (!rawArg) {
  console.error("用法: node scripts/extract-changelog.mjs <version|vX.Y.Z> [--github-output]");
  process.exit(1);
}

const version = String(rawArg).replace(/^v/i, "");
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`无效版本: ${rawArg}`);
  process.exit(1);
}

if (!existsSync(changelogPath)) {
  console.error("缺少 CHANGELOG.md");
  process.exit(1);
}

const text = readFileSync(changelogPath, "utf8");
const headingRe = /^## \[([^\]]+)\](?:\s+-\s+\S+)?\s*$/gm;
const matches = [...text.matchAll(headingRe)];
if (matches.length === 0) {
  console.error("CHANGELOG.md 无 ## [version] 章节");
  process.exit(1);
}

let start = -1;
let end = text.length;
for (let i = 0; i < matches.length; i++) {
  const ver = matches[i][1];
  if (ver === version) {
    start = matches[i].index + matches[i][0].length;
    if (i + 1 < matches.length) {
      end = matches[i + 1].index;
    }
    break;
  }
}

if (start < 0) {
  console.error(
    `CHANGELOG.md 缺少 ## [${version}] 节。发版前请把 [Unreleased] 条目挪到该版本节。`,
  );
  process.exit(1);
}

const section = text.slice(start, end).trim();
if (!section) {
  console.error(`## [${version}] 节为空`);
  process.exit(1);
}

const footer = [
  "",
  "---",
  "",
  "**请优先下载 NSIS**（`*-setup.exe`）。",
  "Prefer the NSIS installer (`*-setup.exe`).",
  "",
  "Docs: [releases.md](https://github.com/MidiAug/deepseek-harness-desktop/blob/main/docs/releases.md) · [getting-started.md](https://github.com/MidiAug/deepseek-harness-desktop/blob/main/docs/getting-started.md) · Maintainer: [publishing.md](https://github.com/MidiAug/deepseek-harness-desktop/blob/main/docs/publishing.md)",
  "",
  "Community desktop host — not an official DeepSeek product.",
].join("\n");

const body = `${section}\n${footer}\n`;

if (githubOutput) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) {
    console.error("GITHUB_OUTPUT 未设置");
    process.exit(1);
  }
  // 多行输出：body<<EOF ... EOF
  appendFileSync(out, `body<<EOF\n${body}EOF\n`, "utf8");
  console.log(`Wrote release body for ${version} to GITHUB_OUTPUT`);
} else {
  process.stdout.write(body);
}
