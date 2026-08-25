import { useCallback, useEffect, useRef, useState } from "react";
import {
  shellApi,
  shellLog,
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

export type BootSurfaceMode = "install" | "status";

export type UseBootPanelOpts = {
  startCommand: StartCommand;
  /** false：用户主动停止后挂载，禁止自动 ensure */
  autoStart?: boolean;
  forceStealth?: boolean;
  embedding?: boolean;
  sessionError?: string | null;
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
  sessionError = null,
  onReady,
  onError,
  onBootWorking,
  onOpenSettings,
  onStealthChange,
  onStatusMessage,
}: UseBootPanelOpts) {
  const life = useHostLifecycle();
  const { t } = useLocale();
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fastPath, setFastPath] = useState(false);
  const [runtimeKnown, setRuntimeKnown] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [logOpen, setLogOpen] = useState(true);
  const [dshHomePath, setDshHomePath] = useState("");
  const [installMode, setInstallMode] = useState<InstallMode>("hosted");
  const [awaitingManualStart, setAwaitingManualStart] = useState(false);
  const logBodyRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const onStealthChangeRef = useRef(onStealthChange);
  const onStatusMessageRef = useRef(onStatusMessage);
  const onBootWorkingRef = useRef(onBootWorking);
  const seedBootRef = useRef(life.seedBoot);
  onStealthChangeRef.current = onStealthChange;
  onStatusMessageRef.current = onStatusMessage;
  onBootWorkingRef.current = onBootWorking;
  seedBootRef.current = life.seedBoot;

  const setStatus = useCallback(
    (
      msg: string,
      stageId?: Parameters<typeof life.seedBoot>[0]["stageId"],
      percent?: number | null,
    ) => {
      seedBootRef.current({ message: msg, stageId, percent });
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
        setFailed(true);
        setError(msg);
        startedRef.current = false;
        onError(msg);
      },
      onBootWorking: () => {
        startedRef.current = true;
        onBootWorkingRef.current?.(true);
      },
      onBootResetFault: () => {
        setFailed(false);
        setError(null);
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
      setFailed(false);
      setError(null);
      const msg =
        cmd === "restart_harness" ? t("boot.msg.restart") : t("boot.msg.ensure");
      seedBootRef.current({
        message: msg,
        stageId: "detect",
        percent: 2,
        clearLog: true,
      });
      onStatusMessageRef.current?.(msg);
      try {
        const ready = await shellApi.startHarness(cmd);
        const readyMsg = t("boot.msg.embedding");
        seedBootRef.current({
          message: readyMsg,
          stageId: "start",
          percent: null,
        });
        onStatusMessageRef.current?.(readyMsg);
        onReady(ready);
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        shellLog.error("boot", `startHarness ${cmd}`, msg);
        setFailed(true);
        setError(msg);
        seedBootRef.current({ message: t("boot.msg.failed"), stageId: "start" });
        onStatusMessageRef.current?.(t("boot.msg.failed"));
        startedRef.current = false;
        onError(msg);
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

  useEffect(() => {
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
        setFastPath(ready);
        setRepairing(partial && !ready);
        coldInstall = !ready;
        if (ready) {
          setStatus(t("boot.msg.ensure"), "start");
        } else if (partial) {
          setStatus(t("boot.lead.repair"), "install-dsh");
        }
      } catch {
        setFastPath(false);
        coldInstall = true;
      } finally {
        setRuntimeKnown(true);
      }

      // 主动停止 / 外部运维：禁止自动 ensure，也勿把 session 打成 spawning
      if (startCommand === "external_op" || !autoStart) {
        if (!autoStart && startCommand !== "external_op") {
          setAwaitingManualStart(true);
          setStatus(t("boot.msg.stopped"), "start", null);
          onStatusMessageRef.current?.(t("boot.msg.stopped"));
        }
        return;
      }

      onBootWorkingRef.current?.(coldInstall);
      if (!startedRef.current) {
        startedRef.current = true;
        void start(startCommand);
      }
    })();
  }, [start, startCommand, autoStart, setStatus, t]);

  useEffect(() => {
    if (!logOpen) return;
    const el = logBodyRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [life.logLines, logOpen]);

  useEffect(() => {
    if (!sessionError) return;
    setFailed(true);
    setError(sessionError);
  }, [sessionError]);

  const showFault = failed && !!error;
  // 仅运维 stealth / 探测前空白；Capability OK 不再用 slowBoot 翻出安装卡
  const stealth = forceStealth || !runtimeKnown;
  const working = !showFault && !awaitingManualStart && !embedding;

  /** 安装大卡：真缺包/修复且非停止/失败；其余极简状态面 */
  const surfaceMode: BootSurfaceMode =
    showFault || awaitingManualStart || embedding || fastPath || !runtimeKnown
      ? "status"
      : "install";

  const startManual = useCallback(() => {
    if (startedRef.current) return;
    setAwaitingManualStart(false);
    startedRef.current = true;
    onBootWorkingRef.current?.(true);
    void start(startCommand);
  }, [start, startCommand]);

  useEffect(() => {
    onStealthChangeRef.current?.(stealth);
    return () => onStealthChangeRef.current?.(false);
  }, [stealth]);

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
