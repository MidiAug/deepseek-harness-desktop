/**
 * Fitness: `src/shell/**` 不得 import `src/components/**`（R6/R10 F-import）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shellDir = path.join(root, "src", "shell");

const bad = [];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(ent.name)) continue;
    const text = fs.readFileSync(p, "utf8");
    const re =
      /from\s+["']([^"']*components[^"']*)["']|import\s*\(\s*["']([^"']*components[^"']*)["']\s*\)/g;
    let m;
    while ((m = re.exec(text))) {
      const spec = m[1] || m[2];
      if (/[/\\]components[/\\]|^\.\.\/.*components/.test(spec) || spec.includes("components/")) {
        bad.push(`${path.relative(root, p)} → ${spec}`);
      }
    }
  }
}

walk(shellDir);

if (bad.length) {
  console.error("F-import failed: shell must not import components\n" + bad.join("\n"));
  process.exit(1);
}
console.log("F-import ok");
