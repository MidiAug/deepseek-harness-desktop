import { useCallback, useState } from "react";
import * as shellApi from "../api/shellApi";
import { useAppToast } from "../contexts/ShellToastProvider";
import { useHostLifecycle } from "../contexts/HostLifecycleProvider";
import { shellLog } from "../logger";
import type { ReadyPayload } from "../types/ipc-types";
import { useLocale } from "../locale";
import type { LocaleKey } from "../locale";
import type { BootStageId } from "../hostProgressMap";
import type { InstallMode } from "../runtime/installMode";

export type RecoverySurface = "boot" | "settings";

export type RecoveryActionId =
  | "cleanProfile"
  | "resetConfig"
  | "reinstallDsh";

export type HarnessRecoveryCallbacks = {
  refreshRuntime: () => void;
  onHarnessReady?: (payload: ReadyPayload) => void;
  onBeginHarnessOp?: () => void;
  onHarnessOpFailed?: (message: string) => void;
  onCloseSettings?: () => void;
  reportFault?: (
    message: string | null,
    retry?: () => void | Promise<void>,
  ) => void;
  onBootReady?: (payload: ReadyPayload) => void;
  onBootError?: (message: string) => void;
  onBootWorking?: () => void;
  onBootResetFault?: () => void;
};

type SeedBootOpts = {
  message: string;
  stageId?: BootStageId | null;
  percent?: number | null;
  clearLog?: boolean;
};

type HookOpts = {
  installMode?: InstallMode;
  dshHomePath?: string;
  seedBoot?: (opts: SeedBootOpts) => void;
};

type BusyMap = Partial<Record<RecoveryActionId, boolean>>;

export type RecoveryDialogState = {
  cleanProfile: {
    open: boolean;
    busy: boolean;
    titleKey: LocaleKey;
    bodyKey: LocaleKey;
    onCancel: () => void;
    onConfirm: () => void;
  };
  resetConfig: {
    open: boolean;
    busy: boolean;
    bodyParams: Record<string, string>;
    onCancel: () => void;
    onConfirm: () => void;
  };
  reinstallDsh: {
    open: boolean;
    busy: boolean;
    bodyKey: LocaleKey;
    onCancel: () => void;
    onConfirm: () => void;
  };
};

export function useHarnessRecoveryActions(
  surface: RecoverySurface,
  callbacks: HarnessRecoveryCallbacks,
  opts?: HookOpts,
): {
  request: (id: RecoveryActionId) => void;
  dialogs: RecoveryDialogState;
  busy: BusyMap;
} {
  const { t } = useLocale();
  const life = useHostLifecycle();
  const { showToast } = useAppToast();
  const installMode = opts?.installMode ?? "hosted";
  const dshHomePath = opts?.dshHomePath ?? "";

  const [cleanProfileOpen, setCleanProfileOpen] = useState(false);
  const [resetConfigOpen, setResetConfigOpen] = useState(false);
  const [reinstallOpen, setReinstallOpen] = useState(false);
  const [cleanProfileBusy, setCleanProfileBusy] = useState(false);
  const [resetConfigBusy, setResetConfigBusy] = useState(false);
  const [reinstallBusy, setReinstallBusy] = useState(false);

  const seedBoot = opts?.seedBoot ?? life.seedBoot;

  const runCleanProfile = useCallback(async () => {
    if (surface === "boot") {
      callbacks.onBootWorking?.();
      callbacks.onBootResetFault?.();
      seedBoot({
        message: t("boot.msg.ensure"),
        stageId: "detect",
        percent: 5,
        clearLog: true,
      });
      try {
        const ready = await shellApi.startCleanProfile();
        seedBoot({
          message: t("boot.msg.embedding"),
          stageId: "start",
          percent: null,
        });
        callbacks.onBootReady?.(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "start_clean_profile", msg);
        seedBoot({ message: t("boot.msg.failed"), stageId: "start" });
        callbacks.onBootError?.(msg);
      }
      return;
    }

    callbacks.reportFault?.(null);
    setCleanProfileBusy(true);
    try {
      const ready = await shellApi.startCleanProfile();
      setCleanProfileOpen(false);
      showToast(t("settings.data.cleanProfile.done"));
      callbacks.refreshRuntime();
      callbacks.onHarnessReady?.(ready);
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      callbacks.reportFault?.(msg, runCleanProfile);
    } finally {
      setCleanProfileBusy(false);
    }
  }, [callbacks, seedBoot, showToast, surface, t]);

  const runResetConfig = useCallback(async () => {
    if (surface === "boot") {
      callbacks.onBootWorking?.();
      callbacks.onBootResetFault?.();
      setResetConfigBusy(true);
      life.beginOps(t("boot.msg.resettingConfig"));
      seedBoot({
        message: t("boot.msg.resettingConfig"),
        stageId: "detect",
        percent: 5,
        clearLog: true,
      });
      try {
        const ready = await shellApi.resetDshHome();
        setResetConfigOpen(false);
        callbacks.onBootReady?.(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "reset_dsh_home", msg);
        seedBoot({ message: t("boot.msg.resetConfigFailed"), stageId: "start" });
        callbacks.onBootError?.(msg);
      } finally {
        setResetConfigBusy(false);
        life.endOps({ clearProgress: true });
      }
      return;
    }

    callbacks.reportFault?.(null);
    setResetConfigBusy(true);
    setResetConfigOpen(false);
    callbacks.onCloseSettings?.();
    callbacks.onBeginHarnessOp?.();
    life.beginOps(t("boot.msg.resettingConfig"));
    try {
      const ready = await shellApi.resetDshHome();
      callbacks.refreshRuntime();
      callbacks.onHarnessReady?.(ready);
      showToast(t("settings.data.resetConfig.done"));
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      callbacks.onHarnessOpFailed?.(msg);
    } finally {
      life.endOps({ clearProgress: true });
      setResetConfigBusy(false);
    }
  }, [callbacks, life, seedBoot, showToast, surface, t]);

  const runReinstallDsh = useCallback(async () => {
    if (surface === "boot") {
      callbacks.onBootWorking?.();
      callbacks.onBootResetFault?.();
      setReinstallBusy(true);
      seedBoot({
        message: t("boot.msg.reinstalling"),
        stageId: "detect",
        percent: 5,
        clearLog: true,
      });
      try {
        const ready = await shellApi.reinstallDsh();
        setReinstallOpen(false);
        seedBoot({
          message: t("boot.msg.embedding"),
          stageId: "start",
          percent: null,
        });
        callbacks.onBootReady?.(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", "reinstall_dsh", msg);
        seedBoot({ message: t("boot.msg.reinstallFailed"), stageId: "start" });
        callbacks.onBootError?.(msg);
      } finally {
        setReinstallBusy(false);
      }
      return;
    }

    callbacks.reportFault?.(null);
    setReinstallBusy(true);
    setReinstallOpen(false);
    callbacks.onCloseSettings?.();
    callbacks.onBeginHarnessOp?.();
    life.beginOps(t("boot.msg.reinstalling"));
    try {
      const ready = await shellApi.reinstallDsh();
      callbacks.refreshRuntime();
      callbacks.onHarnessReady?.(ready);
      showToast(t("settings.data.reinstallDsh.done"));
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      callbacks.onHarnessOpFailed?.(msg);
    } finally {
      life.endOps({ clearProgress: true });
      setReinstallBusy(false);
    }
  }, [callbacks, life, seedBoot, showToast, surface, t]);

  const request = useCallback((id: RecoveryActionId) => {
    switch (id) {
      case "cleanProfile":
        setCleanProfileOpen(true);
        break;
      case "resetConfig":
        setResetConfigOpen(true);
        break;
      case "reinstallDsh":
        setReinstallOpen(true);
        break;
    }
  }, []);

  const cleanProfileTitleKey: LocaleKey =
    surface === "settings"
      ? "settings.data.cleanProfile.confirmTitle"
      : "boot.cleanProfile.confirmTitle";
  const cleanProfileBodyKey: LocaleKey =
    surface === "settings"
      ? "settings.data.cleanProfile.confirm"
      : "boot.cleanProfile.confirm";

  const reinstallBodyKey: LocaleKey =
    installMode === "system"
      ? "boot.reinstallDsh.confirmSystem"
      : "boot.reinstallDsh.confirmHosted";

  return {
    request,
    busy: {
      cleanProfile: cleanProfileBusy,
      resetConfig: resetConfigBusy,
      reinstallDsh: reinstallBusy,
    },
    dialogs: {
      cleanProfile: {
        open: cleanProfileOpen,
        busy: surface === "settings" ? cleanProfileBusy : false,
        titleKey: cleanProfileTitleKey,
        bodyKey: cleanProfileBodyKey,
        onCancel: () => {
          if (!cleanProfileBusy) setCleanProfileOpen(false);
        },
        onConfirm: () => {
          if (surface === "boot") setCleanProfileOpen(false);
          void runCleanProfile();
        },
      },
      resetConfig: {
        open: resetConfigOpen,
        busy: resetConfigBusy,
        bodyParams: { path: dshHomePath || "—" },
        onCancel: () => {
          if (!resetConfigBusy) setResetConfigOpen(false);
        },
        onConfirm: () => void runResetConfig(),
      },
      reinstallDsh: {
        open: reinstallOpen,
        busy: reinstallBusy,
        bodyKey: reinstallBodyKey,
        onCancel: () => {
          if (!reinstallBusy) setReinstallOpen(false);
        },
        onConfirm: () => void runReinstallDsh(),
      },
    },
  };
}
