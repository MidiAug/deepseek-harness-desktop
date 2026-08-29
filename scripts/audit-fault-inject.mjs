#!/usr/bin/env node
/**
 * B67 故障注入矩阵：跑 Rust `fault_*` 场景并打印目录。
 * 真机杀恢复见 `pnpm check:host:live`（J2）。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MATRIX = [
  "fault_sweep_clear_when_port_free",
  "fault_sweep_kill_when_owner_matches",
  "fault_sweep_leave_when_foreign_owner",
  "fault_sweep_leave_when_owner_unknown",
  "fault_port_skips_occupied",
  "fault_port_exhaustion_named_spawn_failed",
  "fault_wait_process_gone_named",
  "fault_wait_timeout_when_never_healthy",
  "fault_wait_recovers_after_transient_fails",
  "fault_probe_hang_does_not_count_healthy",
  "fault_probe_flips_200_to_401",
  "fault_probe_token_ok_then_server_dies",
  "fault_lock_storm_only_one_holder",
  "fault_closure_rejects_missing_scoped_dep",
  "fault_closure_ok_when_dep_present",
  "fault_partial_detects_missing_entry_with_tree",
  "fault_corrupt_package_json_meta_empty",
  "fault_boot_lock_serializes_two_critical_sections",
  "live_holder_blocks_acquire",
  "dead_holder_is_preempted",
  "probe_service_healthy_connection_refused",
];

console.log("Host fault matrix (B67):");
for (const id of MATRIX) {
  console.log(`  - ${id}`);
}

console.log("\nRunning cargo test filter `fault_` (+ lock/probe fixtures)…\n");
const r = spawnSync(
  "cargo",
  [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "fault_",
    "--",
    "--nocapture",
  ],
  { cwd: root, stdio: "inherit", shell: true },
);

if (r.status !== 0) {
  process.exit(r.status || 1);
}

console.log("\naudit:fault ok");
