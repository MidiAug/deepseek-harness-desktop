#!/usr/bin/env node
/** B49 bundle contract checks */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundle = path.join(root, "src-tauri/inject/bundle.js");
const mod = path.join(root, "src-tauri/src/inject/mod.rs");

if (!fs.existsSync(bundle)) {
  console.error("missing bundle.js — run: pnpm build:inject");
  process.exit(1);
}

const src = fs.readFileSync(bundle, "utf8");
const modSrc = fs.readFileSync(mod, "utf8");

const checks = [
  { name: "bundle has __dshShell kernel", ok: /__dshShell\.kernel/.test(src) },
  { name: "bundle has feature registry", ok: /registerFeature/.test(src) },
  { name: "bundle has zone resolver", ok: /services\.zone/.test(src) },
  { name: "bundle has menu feature", ok: /registerFeature\("menu"/.test(src) },
  { name: "no legacy inject modules", ok: !/-legacy/.test(src) },
  { name: "bundle has hygiene service", ok: /services\.hygiene/.test(src) },
  { name: "bundle has session-log service", ok: /services\.sessionLog/.test(src) },
  { name: "bundle has sidebar-probe service", ok: /services\.sidebarProbe/.test(src) },
  { name: "single shell message listener", ok: (src.match(/addEventListener\("message"/g) || []).length === 1 },
  { name: "kernel routes shell messages", ok: /onShellMessageType/.test(src) },
  { name: "bundle has desktop-action handler", ok: /d\.type === "desktop-action"/.test(src) },
  { name: "bundle has textEdit service", ok: /services\.textEdit/.test(src) },
  { name: "bundle has DOM fallback closest", ok: /closest:\s*closest/.test(src) },
  { name: "bundle has menu context stash", ok: /setMenuContext/.test(src) },
  { name: "bundle includes hygiene", ok: /selection-hygiene/.test(src) },
  { name: "bundle includes session-log", ok: /session-log-proxy/.test(src) },
  { name: "mod.rs includes bundle.js only", ok: /include_str!\("\.\.\/\.\.\/inject\/bundle\.js"\)/.test(modSrc) },
  { name: "single guard flag", ok: (src.match(/__dshShellGuardOk/g) || []).length >= 1 },
];

let failed = 0;
for (const c of checks) {
  if (!c.ok) {
    console.error("FAIL:", c.name);
    failed++;
  } else {
    console.log("ok:", c.name);
  }
}
if (failed) process.exit(1);
console.log("\ninject bundle checks passed.");
