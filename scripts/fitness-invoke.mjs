/**
 * Fitness: 禁止在 `src/components/**` 内裸 `invoke`（须走 shell/api）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(root, "src", "components");

const bad = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(ent.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    if (
      /from\s+["']@tauri-apps\/api\/core["']/.test(text) ||
      /\binvoke\s*[<(]/.test(text)
    ) {
      bad.push(path.relative(root, p));
    }
  }
}

walk(componentsDir);

if (bad.length) {
  console.error(
    "F-invoke failed: components must not call invoke directly\n" + bad.join("\n"),
  );
  process.exit(1);
}
console.log("F-invoke ok");
