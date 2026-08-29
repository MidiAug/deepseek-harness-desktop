#!/usr/bin/env node
/**
 * F-fault-prefix：Rust HostError 故障前缀 ⊆ 前端 recoveryMatrix 已知前缀。
 * OPEN_PATH / HIDE / 无前缀 Msg 为非 Boot 故障面，列入白名单。
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rustSrc = readFileSync(resolve(root, "src-tauri/src/error.rs"), "utf8");
const tsSrc = readFileSync(
  resolve(root, "src/shell/errors/recoveryMatrix.ts"),
  "utf8",
);

const RUST_WHITELIST = new Set(["OPEN_PATH", "HIDE"]);

const rustPrefixes = new Set();
for (const m of rustSrc.matchAll(/#\[error\("([A-Z_]+):/g)) {
  rustPrefixes.add(m[1]);
}

const tsMatch = tsSrc.match(
  /const KNOWN_PREFIXES:\s*FaultPrefix\[\]\s*=\s*\[([\s\S]*?)\];/,
);
if (!tsMatch) {
  console.error("F-fault-prefix: cannot find KNOWN_PREFIXES in recoveryMatrix.ts");
  process.exit(1);
}
const tsPrefixes = new Set();
for (const m of tsMatch[1].matchAll(/"([A-Z_]+)"/g)) {
  tsPrefixes.add(m[1]);
}

const missing = [];
for (const p of rustPrefixes) {
  if (RUST_WHITELIST.has(p)) continue;
  if (!tsPrefixes.has(p)) missing.push(p);
}

if (missing.length) {
  console.error(
    "F-fault-prefix FAIL: Rust HostError prefixes missing from TS KNOWN_PREFIXES:",
    missing.join(", "),
  );
  console.error("  Rust:", [...rustPrefixes].sort().join(", "));
  console.error("  TS:  ", [...tsPrefixes].sort().join(", "));
  process.exit(1);
}

const extraTs = [...tsPrefixes].filter((p) => !rustPrefixes.has(p));
if (extraTs.length) {
  console.warn(
    "F-fault-prefix advisory: TS-only prefixes (ok if DEFAULT-adjacent):",
    extraTs.join(", "),
  );
}

console.log(
  "F-fault-prefix ok:",
  [...rustPrefixes].filter((p) => !RUST_WHITELIST.has(p)).sort().join(", "),
);
