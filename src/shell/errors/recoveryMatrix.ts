import type { LocaleKey } from "../locale";

export type FaultPrefix =
  | "INSTALL_FAILED"
  | "HEALTH_TIMEOUT"
  | "SPAWN_FAILED"
  | "NODE_MISSING"
  | "HARNESS_NOT_FOUND"
  | "DEFAULT";

export type FaultCta = "retry" | "network" | "logs" | "reset";

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
    secondary: ["logs", "reset"],
  },
  SPAWN_FAILED: {
    titleKey: "boot.fault.spawn.title",
    bodyKey: "boot.fault.spawn.body",
    primary: "retry",
    secondary: ["reset"],
  },
  NODE_MISSING: {
    titleKey: "boot.fault.node.title",
    bodyKey: "boot.fault.node.body",
    primary: "retry",
    secondary: ["reset"],
  },
  HARNESS_NOT_FOUND: {
    titleKey: "boot.fault.harness.title",
    bodyKey: "boot.fault.harness.body",
    primary: "reset",
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
  reset: "boot.cta.reset",
};
