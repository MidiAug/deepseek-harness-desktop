#!/usr/bin/env node
/**
 * 宿主硬门聚合（B66）：CI / 本地默认真源。
 * 不含 CDP 真机旅程（见 check:host:live）。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  console.log(`\n==== ${label} ====`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    console.error(`${label} failed (${r.status})`);
    process.exit(r.status || 1);
  }
}

run("fitness", "pnpm", ["fitness"]);
run("test:unit", "pnpm", ["test:unit"]);
run("cargo test", "cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
run("check:release", "pnpm", ["check:release"]);

console.log("\ncheck:host ok");
