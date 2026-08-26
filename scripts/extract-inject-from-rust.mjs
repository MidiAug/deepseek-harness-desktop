#!/usr/bin/env node
/** One-time / regen: pull r#"..."# INIT_SCRIPT bodies from Rust into inject/*.js */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");

function extract(rustPath) {
  const s = fs.readFileSync(rustPath, "utf8");
  const m = s.match(/pub const INIT_SCRIPT: &str = r#"([\s\S]*)"#;/);
  if (!m) throw new Error(`no INIT_SCRIPT in ${rustPath}`);
  return m[1];
}

const map = {
  "inject/services/hygiene-legacy.js": "src/selection_hygiene.rs",
  "inject/features/sidebar-probe-legacy.js": "src/sidebar_probe.rs",
  "inject/features/session-log-legacy.js": "src/session_log_proxy.rs",
  "inject/features/menu-legacy.js": "src/context_menu.rs",
};

for (const [out, rust] of Object.entries(map)) {
  const body = extract(path.join(tauri, rust));
  const full = path.join(tauri, out);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const header = `// MIGRATED from src-tauri/${rust} (B49). Wrap with kernel; do not edit Rust embed.\n`;
  fs.writeFileSync(full, header + body);
  console.log("wrote", out, body.length, "chars");
}
