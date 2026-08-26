/** 导出诊断前由壳写入的快照（session / app-state / inject 错误）。 */

import { getShellSessionId } from "./sessionId";

export type AppStateSnapshot = {
  sessionPhase?: string;
  onboardingGate?: string;
  bodyView?: string;
  port?: number | null;
  settingsOpen?: boolean;
  closeAskOpen?: boolean;
  lastBootError?: string;
  lastRecoveryAction?: string;
};

const INJECT_ERRORS_MAX = 50;

let appState: AppStateSnapshot = {};
const injectErrors: string[] = [];

export function getDiagnosticsSessionId(): string {
  return getShellSessionId();
}

export function setAppStateSnapshot(partial: AppStateSnapshot): void {
  appState = { ...appState, ...partial };
}

export function getAppStateSnapshot(): AppStateSnapshot {
  return { ...appState };
}

export function recordBootError(reason: string): void {
  setAppStateSnapshot({ lastBootError: reason.slice(0, 500) });
}

export function clearBootError(): void {
  setAppStateSnapshot({ lastBootError: undefined });
}

export function recordRecoveryAction(action: string): void {
  setAppStateSnapshot({ lastRecoveryAction: action });
}

export function recordInjectError(line: string): void {
  injectErrors.push(line);
  while (injectErrors.length > INJECT_ERRORS_MAX) injectErrors.shift();
}

export function getInjectErrorsSnapshot(): string[] {
  return [...injectErrors];
}

export function buildDiagnosticsContextPayload(): {
  sessionId: string;
  appState: AppStateSnapshot;
  injectErrors: string[];
} {
  return {
    sessionId: getShellSessionId(),
    appState: getAppStateSnapshot(),
    injectErrors: getInjectErrorsSnapshot(),
  };
}
