import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import * as shellApi from "../api/shellApi";
import { useHostLifecycle } from "../contexts/HostLifecycleProvider";
import { useAppToast } from "../contexts/ShellToastProvider";
import type { HarnessUpdateCheck, ReadyPayload } from "../types/ipc-types";
import { useLocale } from "../locale";

type FaultReporter = (
  message: string | null,
  retry?: () => void | Promise<void>,
) => void;

export type HarnessSettingsOpsOptions = {
  refreshRuntime: () => void;
  onHarnessReady?: (payload: ReadyPayload) => void;
  reportFault: FaultReporter;
};

export type HarnessSettingsOps = {
  updateCheck: HarnessUpdateCheck | null;
  /** 轻检查中：不锁 HostLifecycle，仅行内态 */
  checkingUpdate: boolean;
  setUpdateCheck: (check: HarnessUpdateCheck | null) => void;
  onCheckUpdate: () => Promise<void>;
  onApplyUpdate: () => Promise<void>;
  onApplyNetworkRestart: () => Promise<void>;
};

const HarnessSettingsOpsContext = createContext<HarnessSettingsOps | null>(null);

function useHarnessSettingsOpsImpl({
  refreshRuntime,
  onHarnessReady,
  reportFault,
}: HarnessSettingsOpsOptions): HarnessSettingsOps {
  const { t } = useLocale();
  const life = useHostLifecycle();
  const { showToast } = useAppToast();
  const [updateCheck, setUpdateCheck] = useState<HarnessUpdateCheck | null>(
    null,
  );
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const onCheckUpdate = useCallback(async () => {
    reportFault(null);
    // 轻检查不走 beginOps：避免闪「运行详情」并 clear 掉启动日志
    setCheckingUpdate(true);
    try {
      const r = await shellApi.checkHarnessUpdate();
      setUpdateCheck(r);
      if (!r.updateAvailable) {
        showToast(t("settings.about.upToDate"));
      } else {
        showToast(
          `${t("settings.about.updateFound")} ${r.latest ?? "?"} (${r.local ?? "?"})`,
        );
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      reportFault(msg, onCheckUpdate);
    } finally {
      setCheckingUpdate(false);
    }
  }, [reportFault, showToast, t]);

  const onApplyUpdate = useCallback(async () => {
    reportFault(null);
    life.beginOps(t("settings.about.harnessUpdating"));
    try {
      const payload = await shellApi.applyHarnessUpdate();
      setUpdateCheck(null);
      refreshRuntime();
      onHarnessReady?.(payload);
      showToast(t("settings.about.updated"));
      life.seedBoot({
        message: t("boot.msg.harnessUpdated"),
        stageId: "start",
        percent: 100,
      });
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      reportFault(msg, onApplyUpdate);
      refreshRuntime();
    } finally {
      life.endOps();
    }
  }, [life, onHarnessReady, refreshRuntime, reportFault, showToast, t]);

  const onApplyNetworkRestart = useCallback(async () => {
    reportFault(null);
    life.beginOps(t("settings.hint.networkRestart"));
    try {
      const payload = await shellApi.restartHarness();
      refreshRuntime();
      onHarnessReady?.(payload);
      showToast(t("settings.about.networkRestarted"));
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      reportFault(msg, onApplyNetworkRestart);
    } finally {
      life.endOps({ clearProgress: true });
    }
  }, [life, onHarnessReady, refreshRuntime, reportFault, showToast, t]);

  return {
    updateCheck,
    checkingUpdate,
    setUpdateCheck,
    onCheckUpdate,
    onApplyUpdate,
    onApplyNetworkRestart,
  };
}

export function HarnessSettingsOpsProvider({
  children,
  ...opts
}: HarnessSettingsOpsOptions & { children: ReactNode }) {
  const value = useHarnessSettingsOpsImpl(opts);
  return (
    <HarnessSettingsOpsContext.Provider value={value}>
      {children}
    </HarnessSettingsOpsContext.Provider>
  );
}

export function useHarnessSettingsOps(): HarnessSettingsOps {
  const ctx = useContext(HarnessSettingsOpsContext);
  if (!ctx) {
    throw new Error(
      "useHarnessSettingsOps 须在 HarnessSettingsOpsProvider 内使用",
    );
  }
  return ctx;
}
