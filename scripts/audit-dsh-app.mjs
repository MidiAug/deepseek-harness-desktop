#!/usr/bin/env node
/**
 * B68 应用层活体审计：本机 DSH_HOME / 托管安装树 / 全局 dsh / settings 覆盖。
 * 用法：pnpm audit:dsh
 * 硬断言：AUDIT_ASSERT=1 时，关键路径缺失则 exit 1（默认只报告）。
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "dev/analysis/audit-artifacts");
const assertHard = process.env.AUDIT_ASSERT === "1";

const appData = process.env.APPDATA || "";
const shellRoaming = join(appData, "com.deepseek.harness.desktop");
const harnessDir = join(shellRoaming, "harness");
const hostedDshHome = join(shellRoaming, "dsh-home");
const settingsPath = join(shellRoaming, "settings.json");
const dshEntryRel = join(
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "lib",
  "bin.js",
);
const hostedEntry = join(harnessDir, dshEntryRel);
const hostedPkg = join(
  harnessDir,
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "package.json",
);
const globalEntry = join(
  appData,
  "npm",
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "lib",
  "bin.js",
);
const globalPkg = join(
  appData,
  "npm",
  "node_modules",
  "@deepseek-ai",
  "dsh",
  "package.json",
);
const defaultDshHome = join(homedir(), ".dsh");

const checks = [];
function check(id, ok, detail, data) {
  checks.push({ id, ok, detail, data: data ?? null });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${id}: ${detail}`);
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function listTop(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function dshHomeMarkers(dir) {
  if (!existsSync(dir)) return { exists: false, markers: [] };
  const markers = ["settings.yaml", "conversations", "plugins", "sessions"].filter(
    (name) => existsSync(join(dir, name)),
  );
  return { exists: true, markers, isOurs: markers.length > 0 };
}

function pkgMeta(pkgPath) {
  if (!existsSync(pkgPath)) return null;
  const text = readFileSync(pkgPath, "utf8");
  const json = (() => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const scopedDeps = json?.dependencies
    ? Object.keys(json.dependencies).filter((k) => k.startsWith("@deepseek-ai/"))
    : [];
  const missing = [];
  for (const name of scopedDeps) {
    const short = name.replace("@deepseek-ai/", "");
    const top = join(harnessDir, "node_modules", "@deepseek-ai", short);
    const nested = join(
      harnessDir,
      "node_modules",
      "@deepseek-ai",
      "dsh",
      "node_modules",
      "@deepseek-ai",
      short,
    );
    if (!existsSync(top) && !existsSync(nested)) missing.push(name);
  }
  return {
    version: json?.version ?? null,
    digest,
    scopedDeps,
    missingClosureDeps: missing,
    parseOk: Boolean(json),
  };
}

// --- shell AppData ---
check(
  "shell.appdata-root",
  existsSync(shellRoaming),
  existsSync(shellRoaming) ? shellRoaming : "missing AppData shell root",
);

const settings = existsSync(settingsPath) ? readJson(settingsPath) : null;
check(
  "shell.settings.json",
  Boolean(settings),
  settings
    ? `runtimeSource=${settings.runtimeSource ?? "?"} dshHomeOverride=${settings.dshHomeOverride ? "set" : "empty"} preferredPort=${settings.preferredPort ?? "?"}`
    : "missing settings.json",
  settings
    ? {
        runtimeSource: settings.runtimeSource,
        dshHomeOverride: settings.dshHomeOverride || null,
        preferredPort: settings.preferredPort,
      }
    : null,
);

const override = String(settings?.dshHomeOverride ?? "").trim();
const effectiveDshHome = override || defaultDshHome;
check(
  "dsh-home.effective",
  true,
  `${effectiveDshHome}${override ? " (override)" : " (default ~/.dsh)"}`,
  { override: override || null, default: defaultDshHome },
);

const homeInfo = dshHomeMarkers(effectiveDshHome);
check(
  "dsh-home.markers",
  homeInfo.exists,
  homeInfo.exists
    ? `exists markers=[${homeInfo.markers.join(",")}] isOurs=${homeInfo.isOurs}`
    : "DSH_HOME path missing",
  homeInfo,
);

const hostedHomeInfo = dshHomeMarkers(hostedDshHome);
check(
  "hosted.dsh-home-slot",
  true,
  hostedHomeInfo.exists
    ? `AppData/dsh-home markers=[${hostedHomeInfo.markers.join(",")}]`
    : "AppData/dsh-home absent (ok if using ~/.dsh or override)",
  hostedHomeInfo,
);

// --- hosted harness install tree ---
const harnessExists = existsSync(harnessDir);
check(
  "hosted.harness-dir",
  true,
  harnessExists ? harnessDir : "no AppData/harness (system-only or never installed)",
);

if (harnessExists) {
  check(
    "hosted.entry-bin",
    existsSync(hostedEntry),
    existsSync(hostedEntry) ? hostedEntry : `missing ${dshEntryRel}`,
  );
  const meta = pkgMeta(hostedPkg);
  check(
    "hosted.package-json",
    Boolean(meta?.parseOk),
    meta
      ? `version=${meta.version} digest=${meta.digest} scopedDeps=${meta.scopedDeps.length}`
      : "missing hosted package.json",
    meta,
  );
  if (meta) {
    check(
      "hosted.closure-deps",
      meta.missingClosureDeps.length === 0,
      meta.missingClosureDeps.length === 0
        ? "all @deepseek-ai/* hard deps present"
        : `missing ${meta.missingClosureDeps.join(", ")}`,
      { missing: meta.missingClosureDeps },
    );
  }
  const nodeModules = join(harnessDir, "node_modules", "@deepseek-ai");
  check(
    "hosted.scope-packages",
    existsSync(nodeModules),
    existsSync(nodeModules)
      ? listTop(nodeModules).join(", ")
      : "no node_modules/@deepseek-ai",
  );
}

// --- global npm dsh ---
check(
  "system.global-entry",
  existsSync(globalEntry),
  existsSync(globalEntry) ? globalEntry : "global npm @deepseek-ai/dsh entry missing",
);
if (existsSync(globalPkg)) {
  const g = readJson(globalPkg);
  check(
    "system.global-version",
    Boolean(g?.version),
    g?.version ? `npm global dsh@${g.version}` : "unreadable version",
    { version: g?.version ?? null },
  );
}

// --- 危险重置候选（信息项；真正拦截逻辑见 Rust validate_dsh_home_reset_target_at）---
const dangerous = [
  { path: homedir(), label: "user-home" },
  { path: process.platform === "win32" ? "C:\\" : "/", label: "drive-root" },
  { path: shellRoaming, label: "appdata-root" },
  { path: join(shellRoaming, "clean-profile-session"), label: "clean-profile" },
];
for (const d of dangerous) {
  const abs = resolve(d.path);
  check(
    `reset-safety.sample-${d.label}`,
    true,
    `candidate exists=${existsSync(abs)} path=${abs} (Rust unit covers block)`,
  );
}

const failed = checks.filter((c) => !c.ok);
const report = {
  timestamp: new Date().toISOString(),
  platform: process.platform,
  paths: {
    shellRoaming,
    harnessDir,
    hostedDshHome,
    defaultDshHome,
    effectiveDshHome,
    hostedEntry,
    globalEntry,
  },
  checks,
  summary: {
    total: checks.length,
    failed: failed.length,
    failedIds: failed.map((c) => c.id),
  },
};

mkdirSync(outDir, { recursive: true });
const stamp = report.timestamp.replace(/[:.]/g, "-");
const outPath = join(outDir, `dsh-app-audit-${stamp}.json`);
writeFileSync(outPath, JSON.stringify({ outPath, ...report }, null, 2));
console.log("\n" + JSON.stringify({ outPath, summary: report.summary }, null, 2));

if (assertHard && failed.length) {
  process.exit(1);
}
