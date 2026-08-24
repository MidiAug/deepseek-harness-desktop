import {
  getRecoveryPlan,
  type FaultCta,
  type RecoveryPlan,
} from "./recoveryMatrix.ts";

export type FaultDisplay = {
  plan: RecoveryPlan;
  /** harness 抛出的根因，或 HostError 正文 */
  detail: string;
  /** 由简到繁排列 */
  actions: FaultCta[];
};

/** 恢复操作展示顺序：由简到繁 */
const ACTION_ORDER: FaultCta[] = [
  "retry",
  "logs",
  "network",
  "cleanProfile",
  "resetConfig",
  "reinstallDsh",
];

function splitHarnessRootCause(raw: string): string | null {
  const idx = raw.indexOf("\n\n");
  if (idx < 0) return null;
  const tail = raw.slice(idx + 2).trim();
  return tail || null;
}

function stripHostErrorPrefix(raw: string): string {
  const idx = raw.indexOf(":");
  if (idx > 0 && idx < 40) {
    return raw.slice(idx + 1).trim();
  }
  return raw.trim();
}

function extractDetail(raw: string): string {
  return splitHarnessRootCause(raw) ?? stripHostErrorPrefix(raw);
}

function orderActions(plan: RecoveryPlan): FaultCta[] {
  const want = new Set<FaultCta>([plan.primary, ...plan.secondary]);
  return ACTION_ORDER.filter((cta) => want.has(cta));
}

export function parseFaultDisplay(raw: string): FaultDisplay {
  const plan = getRecoveryPlan(raw);
  const detail = extractDetail(raw);
  return { plan, detail, actions: orderActions(plan) };
}
