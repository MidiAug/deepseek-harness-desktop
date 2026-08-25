/**
 * 生成 src/bindings.ts（specta）。日常开发改 Rust 契约类型后运行。
 * 实现：GEN_BINDINGS=1 cargo test write_bindings_when_gen_env_set
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");

const env = {
  ...process.env,
  GEN_BINDINGS: "1",
};

const r = spawnSync(
  "cargo",
  [
    "test",
    "--lib",
    "contracts::tests::write_bindings_when_gen_env_set",
    "--",
    "--exact",
    "--nocapture",
  ],
  { cwd: tauri, env, stdio: "inherit", shell: true },
);

if (r.status !== 0) {
  console.error("gen:bindings failed");
  process.exit(r.status || 1);
}
console.log("gen:bindings ok → src/bindings.ts");
