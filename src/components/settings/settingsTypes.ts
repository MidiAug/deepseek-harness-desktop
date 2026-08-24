export type SettingsSection =
  | "appearance"
  | "network"
  | "runtime"
  | "data"
  | "about";

/** 旧深链 `window` → 界面；其它非法值回退外观。 */
export function normalizeSettingsSection(
  raw: string | undefined | null,
): SettingsSection {
  if (raw === "window") return "appearance";
  if (
    raw === "appearance" ||
    raw === "network" ||
    raw === "runtime" ||
    raw === "data" ||
    raw === "about"
  ) {
    return raw;
  }
  return "appearance";
}
