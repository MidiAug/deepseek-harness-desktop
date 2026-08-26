/**
 * Static guard: inject bundle copy contract + shell bridge gesture notes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "src-tauri", "inject", "bundle.js");
const hook = path.join(
  root,
  "src",
  "shell",
  "hooks",
  "useHarnessContextMenu.ts",
);
if (!fs.existsSync(file)) {
  console.error("missing bundle.js — run pnpm build:inject");
  process.exit(1);
}
const src = fs.readFileSync(file, "utf8");
const hookSrc = fs.readFileSync(hook, "utf8");

const checks = [
  {
    name: "defines copyActiveSelection",
    ok: /function copyActiveSelection\s*\(/.test(src),
  },
  {
    name: "menu copy uses copyActiveSelection (menu-content)",
    ok: /via:\s*"menu-content"/.test(src) && /copyActiveSelection/.test(src),
  },
  {
    name: "no contains(anchorNode) gate on selection",
    ok: !/copyTarget\.contains\(\s*sel\.anchorNode\s*\)/.test(src),
  },
  {
    name: "iframe copy uses clipboard execCopy (not writeText)",
    ok:
      /function execCopy/.test(src) &&
      !/navigator\.clipboard\.writeText\(text\);\s*return true/.test(src),
  },
  {
    name: "native copy defers clearSelection (setTimeout)",
    ok: /setTimeout\(\s*function\s*\(\s*\)\s*\{[\s\S]*?clearSelection\(\)/.test(
      src,
    ),
  },
  {
    name: "inject diag gated off by default",
    ok: /var INJECT_DIAG\s*=\s*false/.test(src),
  },
  {
    name: "contextmenu does not clear selection on open",
    ok: !/ctx\.selectedText = snap;\s*clearSelection\(\)/.test(src),
  },
  {
    name: "shell uses dispatchDesktopAction bridge",
    ok: /dispatchDesktopAction/.test(hookSrc),
  },
  {
    name: "shell menu prevents mousedown focus steal",
    ok: /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(
      fs.readFileSync(
        path.join(root, "src/components/chrome/ShellContextMenu.tsx"),
        "utf8",
      ),
    ),
  },
  {
    name: "input copy no toast in bridge policies",
    ok: /shouldShowCopyToast\("input"\), false/.test(
      fs.readFileSync(
        path.join(root, "src/shell/bridge/policies.test.ts"),
        "utf8",
      ),
    ),
  },
];

let failed = 0;
for (const c of checks) {
  if (!c.ok) {
    console.error(`FAIL: ${c.name}`);
    failed++;
  } else {
    console.log(`ok: ${c.name}`);
  }
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\ncopyActiveSelection static checks passed.");
