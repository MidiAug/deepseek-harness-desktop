import { useCallback, useEffect, useRef, useState } from "react";
import {
  shellApi,
  shellLog,
  takeLinkedHarnessStart,
  useHarnessRecoveryActions,
  useHostLifecycle,
  useLocale,
  type ReadyPayload,
  type StartCommand,
} from "../index";
import type { FaultCta } from "../errors/recoveryMatrix";
import {
  resolveInstallMode,
  type InstallMode,
} from "../runtime/installMode";
import {
  deriveShowFault,
  deriveStealth,
  deriveSurfaceMode,
  type BootSurfaceMode,
} from "../bootSurfaceMode";

export type { BootSurfaceMode };

export type UseBootPanelOpts = {
  startCommand: StartCommand;
  autoStart?: boolean;
  forceStealth?: boolean;
  embedding?: boolean;
  onReady: (payload: ReadyPayload) => void;
  onError: (message: string) => void;
  onBootWorking?: (coldInstall: boolean) => void;
  onOpenSettings: () => void;
  onStealthChange?: (stealth: boolean) => void;
  onStatusMessage?: (message: string) => void;
};

export function useBootPanel({
  startCommand,
  autoStart = true,
  forceStealth = false,
  embedding = false,
  onReady,
  onError,
  onBootWorking,
  onOpenSettings,
  onStealthChange,
  onStatusMessage,
}: UseBootPanelOpts) {
  const life = useHostLifecycle();
  const { t } = useLocale();
  const [logOpen, setLogOpen] = useState(true);
  const [dshHomePath, setDshHomePath] = useState("");
  const [installMode, setInstallMode] = useState<InstallMode>("hosted");
  const [awaitingManualStart, setAwaitingManualStart] = useState(false);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const aliveRef = useRef(true);
  const onStealthChangeRef = useRef(onStealthChange);
  const onStatusMessageRef = useRef(onStatusMessage);
  const onBootWorkingRef = useRef(onBootWorking);
  const seedBootRef = useRef(life.seedBoot);
  const setBootFaultRef = useRef(life.setBootFault);
  const clearBootFaultRef = useRef(life.clearBootFault);
  const setBootMetaRef = useRef(life.setBootMeta);
  onStealthChangeRef.current = onStealthChange;
  onStatusMessageRef.current = onStatusMessage;
  onBootWorkingRef.current = onBootWorking;
  seedBootRef.current = life.seedBoot;
  setBootFaultRef.current = life.setBootFault;
  clearBootFaultRef.current = life.clearBootFault;
  setBootMetaRef.current = life.setBootMeta;

  const { bootFault, bootMeta } = life;
  const error = bootFault.message;
  const showFault = deriveShowFault(bootFault);
  const { fastPath, repairing, runtimeKnown } = bootMeta;

  const setStatus = useCallback(
    (
      msg: string,
      stageId?: Parameters<typeof life.seedBoot>[0]["stageId"],
      percent?: number | null,
      keepIdle?: boolean,
    ) => {
      seedBootRef.current({ message: msg, stageId, percent, keepIdle });
      onStatusMessageRef.current?.(msg);
    },
    [],
  );

  const recovery = useHarnessRecoveryActions(
    "boot",
    {
      refreshRuntime: () => undefined,
      onBootReady: onReady,
      onBootError: (msg) => {
        setBootFaultRef.current(msg);
        startedRef.current = false;
        onError(msg);
      },
      onBootWorking: () => {
        startedRef.current = true;
        onBootWorkingRef.current?.(true);
      },
      onBootResetFault: () => {
        clearBootFaultRef.current();
      },
    },
    {
      installMode,
      dshHomePath,
      seedBoot: (opts) => seedBootRef.current(opts),
    },
  );

  const start = useCallback(
    async (cmd: StartCommand) => {
      clearBootFaultRef.current();
      const msg =
        cmd === "restart_harness" ? t("boot.msg.restart") : t("boot.msg.ensure");
      seedBootRef.current({
        message: msg,
        stageId: "detect",
        percent: 2,
        clearLog: true,
      });
      onStatusMessageRef.current?.(msg);
      const linked = takeLinkedHarnessStart();
      const action = linked?.action ?? "boot.start";
      const opId = linked?.opId ?? shellLog.opBegin(action, { cmd });
      try {
        const ready = await shellApi.startHarness(cmd, opId);
        if (!aliveRef.current) return;
        shellLog.opEnd(opId, action, "ok");
        const readyMsg = t("boot.msg.embedding");
        seedBootRef.current({
          message: readyMsg,
          stageId: "start",
          percent: null,
        });
        onStatusMessageRef.current?.(readyMsg);
        onReady(ready);
      } catch (e) {
        if (!aliveRef.current) return;
        const errMsg = typeof e === "string" ? e : String(e);
        shellLog.opEnd(opId, action, "err");
        shellLog.error("boot", `startHarness ${cmd}`, errMsg);
        setBootFaultRef.current(errMsg);
        seedBootRef.current({ message: t("boot.msg.failed"), stageId: "start" });
        onStatusMessageRef.current?.(t("boot.msg.failed"));
        startedRef.current = false;
        onError(errMsg);
      }
    },
    [onReady, onError, t],
  );

  const runCta = useCallback(
    (cta: FaultCta) => {
      switch (cta) {
        case "retry":
          startedRef.current = true;
          onBootWorkingRef.current?.(true);
          void start(startCommand);
          break;
        case "network":
          onOpenSettings();
          break;
        case "logs":
          void shellApi.openKnownPath("logs");
          break;
        case "resetConfig":
          recovery.request("resetConfig");
          break;
        case "reinstallDsh":
          recovery.request("reinstallDsh");
          break;
        case "cleanProfile":
          recovery.request("cleanProfile");
          break;
      }
    },
    [onOpenSettings, recovery, start, startCommand],
  );

  // 仅本挂载（bootKey）的启动命令；markReady 会把 startCommand 拨回 ensure_and_start，
  // 若进 effect deps 会二次 markBootWorking（embedding→spawning）并假死在「正在确保…」。
  const mountStartCommandRef = useRef(startCommand);

  useEffect(() => {
    aliveRef.current = true;
    const cmd = mountStartCommandRef.current;
    void (async () => {
      let coldInstall = true;
      try {
        const st = await shellApi.getRuntimeStatus();
        setInstallMode(
          resolveInstallMode({
            runtimeSource: st.runtimeSource,
            activeRuntime: st.activeRuntime,
          }),
        );
        setDshHomePath(st.dshHome ?? st.effectiveDshHome ?? "");
        const ready = st.nodeReady && st.harnessReady;
        const partial = Boolean(st.harnessPartial);
        setBootMetaRef.current({
          fastPath: ready,
          repairing: partial && !ready,
          runtimeKnown: true,
        });
        coldInstall = !ready;
        // 已启动后勿再改主文案 / 相位（locale 等 deps 重跑时）
        if (startedRef.current) {
          return;
        }
        if (ready) {
          setStatus(t("boot.msg.ensure"), "start");
        } else if (partial) {
          setStatus(t("boot.lead.repair"), "install-dsh");
        }
      } catch {
        if (startedRef.current) {
          return;
        }
        setBootMetaRef.current({
          fastPath: false,
          repairing: false,
          runtimeKnown: true,
        });
        coldInstall = true;
      }

      if (cmd === "external_op" || !autoStart) {
        if (!autoStart && cmd !== "external_op") {
          setAwaitingManualStart(true);
          shellLog.info("boot", "awaiting manual start", {
            startCommand: cmd,
            autoStart,
            note: "stop does not quit shell; BootPanel will remount status surface",
          });
          setStatus(t("boot.msg.stopped"), "start", null, true);
          onStatusMessageRef.current?.(t("boot.msg.stopped"));
        }
        return;
      }

      if (startedRef.current) {
        return;
      }
      startedRef.current = true;
      onBootWorkingRef.current?.(coldInstall);
      void start(cmd);
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [start, autoStart, setStatus, t]);

  useEffect(() => {
    if (!logOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [life.logLines, logOpen]);

  const stealth = deriveStealth(forceStealth, bootMeta);
  const working = !showFault && !awaitingManualStart && !embedding;

  const surfaceMode = deriveSurfaceMode({
    showFault,
    awaitingManualStart,
    embedding,
    fastPath,
    runtimeKnown,
  });

  const startManual = useCallback(() => {
    if (startedRef.current) return;
    setAwaitingManualStart(false);
    startedRef.current = true;
    onBootWorkingRef.current?.(true);
    void start(startCommand);
  }, [start, startCommand]);

  useEffect(() => {
    onStealthChangeRef.current?.(stealth);
    if (stealth) {
      shellLog.debug("boot", "panel stealth hide surface", {
        autoStart,
        startCommand,
        runtimeKnown,
      });
    }
    return () => onStealthChangeRef.current?.(false);
  }, [stealth, autoStart, startCommand, runtimeKnown]);

  const { message, percent, stageId, logLines } = life;
  const barIndeterminate =
    working &&
    (percent == null || percent === 75 || /npm install|修复安装/.test(message));

  return {
    t,
    life,
    recovery,
    logBodyRef,
    repairing,
    logOpen,
    setLogOpen,
    showFault,
    error,
    installMode,
    runCta,
    stealth,
    working,
    embedding,
    awaitingManualStart,
    startManual,
    message,
    percent,
    stageId,
    logLines,
    barIndeterminate,
    surfaceMode,
  };
}
