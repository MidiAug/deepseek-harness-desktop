/**
 * 一次性脚本：将 dict.ts 拆为 locale/dict/* namespace 文件。
 * 用法：node scripts/split-dict.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dictMod = await import(
  pathToFileURL(path.join(root, "src/shell/locale/dict.ts")).href
);
const { zh, en } = dictMod;

function bucket(key) {
  if (key.startsWith("settings.")) return "settings";
  if (key.startsWith("boot.") || key.startsWith("onboarding.")) return "boot";
  if (
    key.startsWith("chrome.menu.") ||
    key.startsWith("chrome.windowControls.") ||
    key.startsWith("chrome.minimize") ||
    key.startsWith("chrome.maximize") ||
    key.startsWith("chrome.restore") ||
    key.startsWith("chrome.close") ||
    key.startsWith("chrome.sessionLog")
  ) {
    return "titlebar";
  }
  if (
    key.startsWith("chrome.confirm.") ||
    key.startsWith("tray.") ||
    key.startsWith("closeAsk.")
  ) {
    return "common";
  }
  if (key.startsWith("fault.")) return "fault";
  if (key.startsWith("chrome.")) return "common";
  return "common";
}

function pick(obj, ns) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (bucket(k) === ns) out[k] = v;
  }
  return out;
}

const namespaces = ["common", "settings", "boot", "titlebar", "fault"];
const outDir = path.join(root, "src/shell/locale/dict");
fs.mkdirSync(outDir, { recursive: true });

for (const ns of namespaces) {
  for (const lang of ["zh", "en"]) {
    const data = pick(lang === "zh" ? zh : en, ns);
    const lines = Object.entries(data).map(([k, v]) => {
      return `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`;
    });
    const content = `export const ${ns} = {\n${lines.join("\n")}\n} as const;\n`;
    fs.writeFileSync(path.join(outDir, `${ns}.${lang}.ts`), content, "utf8");
  }
}

const indexContent = `import { common as commonZh } from "./common.zh";
import { common as commonEn } from "./common.en";
import { settings as settingsZh } from "./settings.zh";
import { settings as settingsEn } from "./settings.en";
import { boot as bootZh } from "./boot.zh";
import { boot as bootEn } from "./boot.en";
import { titlebar as titlebarZh } from "./titlebar.zh";
import { titlebar as titlebarEn } from "./titlebar.en";
import { fault as faultZh } from "./fault.zh";
import { fault as faultEn } from "./fault.en";

export const zh = {
  ...commonZh,
  ...settingsZh,
  ...bootZh,
  ...titlebarZh,
  ...faultZh,
} as const;

export const en = {
  ...commonEn,
  ...settingsEn,
  ...bootEn,
  ...titlebarEn,
  ...faultEn,
} as const;

export type LocaleKey = keyof typeof zh;
export type LocaleDict = Record<LocaleKey, string>;

export const dicts: Record<"zh" | "en", LocaleDict> = { zh, en };
`;

fs.writeFileSync(path.join(outDir, "index.ts"), indexContent, "utf8");
console.log("Wrote dict namespace files to", outDir);
