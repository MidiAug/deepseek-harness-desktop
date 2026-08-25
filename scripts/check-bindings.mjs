/**
 * 再生 bindings 并与已提交 src/bindings.ts diff（openapi regenerate-and-diff 模式）。
 * 不写盘：走 cargo test bindings_match_committed_file。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");

const r = spawnSync(
  "cargo",
  [
    "test",
    "--lib",
    "contracts::tests::bindings_match_committed_file",
    "--",
    "--exact",
    "--nocapture",
  ],
  { cwd: tauri, stdio: "inherit", shell: true },
);

if (r.status !== 0) {
  console.error(
    "check:bindings failed — src/bindings.ts stale or export broken. Run: pnpm gen:bindings",
  );
  process.exit(r.status || 1);
}
console.log("check:bindings ok");
