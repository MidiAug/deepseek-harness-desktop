import type { LocaleKey } from "../locale";
import type { InstallMode } from "../runtime/installMode.ts";

export type FaultPrefix =
  | "INSTALL_FAILED"
  | "HEALTH_TIMEOUT"
  | "SPAWN_FAILED"
  | "NODE_MISSING"
  | "HARNESS_NOT_FOUND"
  | "PLUGIN_LOAD_FAILED"
  | "DSH_HOME_IN_USE"
  | "DEFAULT";

export type FaultCta =
  | "retry"
  | "network"
  | "logs"
  | "cleanProfile"
  | "resetConfig"
  | "reinstallDsh";

export type RecoveryPlan = {
  prefix: FaultPrefix;
  titleKey: LocaleKey;
  bodyKey: LocaleKey;
  primary: FaultCta;
  secondary: FaultCta[];
};

const KNOWN_PREFIXES: FaultPrefix[] = [
  "INSTALL_FAILED",
  "HEALTH_TIMEOUT",
  "SPAWN_FAILED",
  "NODE_MISSING",
  "HARNESS_NOT_FOUND",
  "PLUGIN_LOAD_FAILED",
  "DSH_HOME_IN_USE",
];

const MATRIX: Record<FaultPrefix, Omit<RecoveryPlan, "prefix">> = {
  INSTALL_FAILED: {
    titleKey: "boot.fault.install.title",
    bodyKey: "boot.fault.install.body",
    primary: "network",
    secondary: ["retry", "logs"],
  },
  HEALTH_TIMEOUT: {
    titleKey: "boot.fault.health.title",
    bodyKey: "boot.fault.health.body",
    primary: "retry",
    secondary: ["cleanProfile", "logs", "resetConfig", "reinstallDsh"],
  },
  SPAWN_FAILED: {
    titleKey: "boot.fault.spawn.title",
    bodyKey: "boot.fault.spawn.body",
    primary: "retry",
    secondary: ["reinstallDsh"],
  },
  NODE_MISSING: {
    titleKey: "boot.fault.node.title",
    bodyKey: "boot.fault.node.body",
    primary: "retry",
    secondary: ["reinstallDsh"],
  },
  HARNESS_NOT_FOUND: {
    titleKey: "boot.fault.harness.title",
    bodyKey: "boot.fault.harness.body",
    primary: "reinstallDsh",
    secondary: ["logs"],
  },
  PLUGIN_LOAD_FAILED: {
    titleKey: "boot.fault.plugin.title",
    bodyKey: "boot.fault.plugin.body",
    primary: "retry",
    secondary: ["logs", "cleanProfile", "resetConfig", "reinstallDsh"],
  },
  DSH_HOME_IN_USE: {
    titleKey: "boot.fault.dshHomeInUse.title",
    bodyKey: "boot.fault.dshHomeInUse.body",
    primary: "retry",
    secondary: ["logs"],
  },
  DEFAULT: {
    titleKey: "boot.fault.default.title",
    bodyKey: "boot.fault.default.body",
    primary: "retry",
    secondary: ["logs"],
  },
};

export function parseHostErrorPrefix(raw: string): FaultPrefix {
  const head = raw.split(":")[0]?.trim();
  if (head && KNOWN_PREFIXES.includes(head as FaultPrefix)) {
    return head as FaultPrefix;
  }
  return "DEFAULT";
}

export function getRecoveryPlan(raw: string): RecoveryPlan {
  const prefix = parseHostErrorPrefix(raw);
  return { prefix, ...MATRIX[prefix] };
}

export const CTA_LABEL_KEYS: Record<FaultCta, LocaleKey> = {
  retry: "boot.cta.retry",
  network: "boot.cta.network",
  logs: "boot.cta.logs",
  cleanProfile: "boot.cta.cleanProfile",
  resetConfig: "boot.cta.resetConfig",
  reinstallDsh: "boot.cta.reinstallDsh",
};

export const CTA_DESC_KEYS: Record<FaultCta, LocaleKey> = {
  retry: "boot.cta.retry.desc",
  network: "boot.cta.network.desc",
  logs: "boot.cta.logs.desc",
  cleanProfile: "boot.cta.cleanProfile.desc",
  resetConfig: "boot.cta.resetConfig.desc",
  reinstallDsh: "boot.cta.reinstallDsh.hosted.desc",
};

const REINSTALL_DESC_KEYS: Record<InstallMode, LocaleKey> = {
  system: "boot.cta.reinstallDsh.system.desc",
  hosted: "boot.cta.reinstallDsh.hosted.desc",
};

export function reinstallCtaDescKey(mode: InstallMode): LocaleKey {
  return REINSTALL_DESC_KEYS[mode];
}
