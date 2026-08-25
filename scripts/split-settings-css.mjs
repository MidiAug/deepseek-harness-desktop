/**
 * 将 settings.css 拆为 modal / cells / controls 三册。
 * 用法：node scripts/split-settings-css.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(root, "src/styles/settings.css"),
  "utf8",
);

/** 按 `}` 切分规则块（保留注释前缀） */
function splitBlocks(css) {
  const blocks = [];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    buf += ch;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) {
        blocks.push(buf.trim());
        buf = "";
      }
    }
  }
  if (buf.trim()) blocks.push(buf.trim());
  return blocks.filter(Boolean);
}

function bucket(block) {
  const head = block.split("{")[0] ?? "";
  if (
    /\.settings-(overlay|modal|nav|content|scroll|close|section-title)\b/.test(
      head,
    ) ||
    /\.drawer-head\b/.test(head) ||
    /\.modal-footer\b/.test(head) ||
    /\.close-ask-actions\b/.test(head)
  ) {
    return "modal";
  }
  if (
    /\.settings-(control|path-input|path-icon|theme-cube|theme-cubes)\b/.test(
      head,
    ) ||
    /\.shell-select\b/.test(head)
  ) {
    return "controls";
  }
  return "cells";
}

const buckets = { modal: [], cells: [], controls: [] };
for (const block of splitBlocks(src)) {
  buckets[bucket(block)].push(block);
}

const outDir = path.join(root, "src/styles/settings");
fs.mkdirSync(outDir, { recursive: true });

for (const [name, blocks] of Object.entries(buckets)) {
  fs.writeFileSync(
    path.join(outDir, `${name}.css`),
    `${blocks.join("\n\n")}\n`,
    "utf8",
  );
}

fs.writeFileSync(
  path.join(outDir, "index.css"),
  `@import "./modal.css";
@import "./cells.css";
@import "./controls.css";
`,
  "utf8",
);

console.log(
  "modal:",
  buckets.modal.length,
  "cells:",
  buckets.cells.length,
  "controls:",
  buckets.controls.length,
);
