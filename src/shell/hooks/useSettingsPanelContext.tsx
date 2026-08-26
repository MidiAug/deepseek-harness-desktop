import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { ReadyPayload, RuntimeStatus, SessionPhase } from "../types/ipc-types";
import type { ShellSettings } from "../settings";

export type SettingsPanelContextValue = {
  settings: ShellSettings;
  setSettings: Dispatch<SetStateAction<ShellSettings>>;
  runtime: RuntimeStatus | null;
  refreshRuntime: () => void;
  locked: boolean;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
  patchAppearance: (
    patch: Partial<
      Pick<
        ShellSettings,
        | "shellTheme"
        | "titlebarCompact"
        | "selectionHygiene"
        | "sessionLogInTitlebar"
      >
    >,
  ) => void;
  reportFault: (
    message: string | null,
    retry?: () => void | Promise<void>,
  ) => void;
  portDraft: string;
  setPortDraft: Dispatch<SetStateAction<string>>;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onCloseSettings?: () => void;
  onBeginHarnessOp?: () => void;
  onHarnessOpFailed?: (message: string) => void;
  onStopHarness?: (opId?: string, action?: string) => void | Promise<void>;
  onRestartHarness?: (opId?: string, action?: string) => void;
  /** 壳会话 FSM；stopped 时服务状态显示「已停止」 */
  sessionPhase?: SessionPhase;
  onDiagnosticsExported?: (path: string) => void;
  onDiagnosticsError?: (
    message: string,
    retry?: () => void | Promise<void>,
  ) => void;
  fault: { message: string; retry?: () => void | Promise<void> } | null;
  onFaultCta: (cta: import("../errors/recoveryMatrix").FaultCta) => void;
};

const SettingsPanelContext = createContext<SettingsPanelContextValue | null>(
  null,
);

export function SettingsPanelProvider({
  value,
  children,
}: {
  value: SettingsPanelContextValue;
  children: ReactNode;
}) {
  return (
    <SettingsPanelContext.Provider value={value}>
      {children}
    </SettingsPanelContext.Provider>
  );
}

export function useSettingsPanelContext(): SettingsPanelContextValue {
  const ctx = useContext(SettingsPanelContext);
  if (!ctx) {
    throw new Error(
      "useSettingsPanelContext 须在 SettingsPanelProvider 内使用",
    );
  }
  return ctx;
}
