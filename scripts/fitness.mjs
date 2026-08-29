/**
 * Fitness 聚合（R10 / R10b / B66）：
 * 硬门：F-import · F-invoke · F-stage · F-bindings · F-fault-prefix · jscpd
 * soft/advisory：knip（见 A9；非「已清零死代码」）
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args, { soft = false } = {}) {
  console.log(`\n== ${label}${soft ? " (soft)" : ""} ==`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (r.status !== 0) {
    if (soft) {
      console.warn(
        `${label}: non-zero (${r.status}) — soft/advisory, not failing fitness`,
      );
      return;
    }
    console.error(`${label} failed (${r.status})`);
    process.exit(r.status || 1);
  }
}

run("F-import", "node", ["scripts/fitness-import.mjs"]);
run("F-invoke", "node", ["scripts/fitness-invoke.mjs"]);
run("F-fault-prefix", "node", ["scripts/fitness-fault-prefix.mjs"]);
run("F-stage", "pnpm", [
  "exec",
  "node",
  "--test",
  "--experimental-strip-types",
  "src/shell/hostProgressMap.test.ts",
]);
run("F-bindings", "node", ["scripts/check-bindings.mjs"]);
run("F-dead (knip)", "pnpm", ["audit:dead"], { soft: true });
run("F-dup (jscpd)", "pnpm", [
  "exec",
  "jscpd",
  "src",
  "--min-lines",
  "8",
  "--min-tokens",
  "60",
  "--threshold",
  "5",
  "--reporters",
  "console",
]);

console.log("\nfitness ok");
