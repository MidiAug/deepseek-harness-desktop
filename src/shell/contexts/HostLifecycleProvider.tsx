/**
 * 宿主安装/更新进度单源：全仓唯一 install-progress listener。
 * BootPanel / Settings 只订阅；勿再本地 listen。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { shellLog } from "../logger";
import type { ProgressPayload, SessionPhase } from "../types/ipc-types";
import {
  isHeartbeat,
  isLogOnly,
  mapStage,
  pushLogLine,
  type BootStageId,
} from "../hostProgressMap";
import {
  INITIAL_BOOT_FAULT,
  INITIAL_BOOT_META,
  type BootFault,
  type BootMeta,
} from "../bootSurfaceMode";

export type BusyReason = "idle" | "boot" | "ops" | "progress";

export type HostLifecycleState = {
  stageId: BootStageId | null;
  message: string;
  percent: number | null;
  logLines: string[];
  busyReason: BusyReason;
  locked: boolean;
  bootFault: BootFault;
  bootMeta: BootMeta;
};

type HostLifecycleApi = HostLifecycleState & {
  beginOps: (initialMsg: string) => void;
  endOps: (opts?: { clearProgress?: boolean }) => void;
  syncSessionPhase: (phase: SessionPhase) => void;
  seedBoot: (opts: {
    message: string;
    stageId?: BootStageId | null;
    percent?: number | null;
    clearLog?: boolean;
    keepIdle?: boolean;
  }) => void;
  resetIdle: (opts?: { clearProgress?: boolean }) => void;
  setBootFault: (message: string | null) => void;
  setBootMeta: (partial: Partial<BootMeta>) => void;
  clearBootFault: () => void;
};

const HostLifecycleContext = createContext<HostLifecycleApi | null>(null);

const INITIAL: HostLifecycleState = {
  stageId: null,
  message: "",
  percent: null,
  logLines: [],
  busyReason: "idle",
  locked: false,
  bootFault: INITIAL_BOOT_FAULT,
  bootMeta: INITIAL_BOOT_META,
};

function patchLocked(
  prev: HostLifecycleState,
  patch: Partial<Omit<HostLifecycleState, "locked">>,
): HostLifecycleState {
  const merged = { ...prev, ...patch };
  return { ...merged, locked: merged.busyReason !== "idle" };
}

export function HostLifecycleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HostLifecycleState>(INITIAL);
  const sessionBusyRef = useRef(false);
  const lastStageRef = useRef<BootStageId | null>(null);

  const applyProgress = useCallback((payload: ProgressPayload) => {
    const { stage: rawStage, message: msg, percent: pct } = payload;
    setState((prev) => {
      const keepOps = prev.busyReason === "ops";
      const nextBusy: BusyReason = keepOps ? "ops" : "progress";
      let stageId = prev.stageId;
      let message = msg;
      let percent = prev.percent;
      const logLines = pushLogLine(prev.logLines, msg);

      if (isLogOnly(rawStage)) {
        stageId = "install-dsh";
        // npm 行只进日志区，不替换主文案（避免顶屏 raw npm info）
        message = prev.message;
        percent = percent != null && percent >= 75 ? percent : 75;
      } else {
        const mapped = mapStage(rawStage);
        if (mapped) {
          if (mapped !== lastStageRef.current) {
            lastStageRef.current = mapped;
            shellLog.info("host", "stage", { stage: mapped, wire: rawStage });
          }
          stageId = mapped;
        }
        if (pct != null) {
          percent = pct;
        } else if (mapped === "install-dsh" || isHeartbeat(msg)) {
          percent = percent != null && percent >= 75 ? percent : 75;
        }
      }

      const done = percent != null && percent >= 100 && !keepOps;
      return patchLocked(prev, {
        stageId,
        message,
        percent,
        logLines,
        busyReason: done ? "idle" : nextBusy,
      });
    });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<ProgressPayload>("install-progress", (ev) => {
      if (!cancelled) applyProgress(ev.payload);
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [applyProgress]);

  const beginOps = useCallback((initialMsg: string) => {
    setState((prev) =>
      patchLocked(prev, {
        stageId: "detect",
        message: initialMsg,
        percent: null,
        logLines: pushLogLine([], initialMsg),
        busyReason: "ops",
      }),
    );
  }, []);

  const endOps = useCallback((opts?: { clearProgress?: boolean }) => {
    const sessionBusy = sessionBusyRef.current;
    setState((prev) => {
      if (opts?.clearProgress && !sessionBusy) {
        return patchLocked(prev, { ...INITIAL, busyReason: "idle" });
      }
      if (sessionBusy) {
        return patchLocked(prev, {
          busyReason: prev.logLines.length > 0 ? "progress" : "boot",
        });
      }
      return patchLocked(prev, { busyReason: "idle" });
    });
  }, []);

  const syncSessionPhase = useCallback((phase: SessionPhase) => {
    const sessionBusy = phase === "installing" || phase === "spawning";
    sessionBusyRef.current = sessionBusy;
    setState((prev) => {
      if (phase === "stopped") {
        if (prev.busyReason === "ops") return prev;
        return patchLocked(prev, { ...INITIAL, busyReason: "idle" });
      }
      if (sessionBusy) {
        if (prev.busyReason === "ops") return prev;
        if (prev.busyReason === "idle") {
          return patchLocked(prev, { busyReason: "boot" });
        }
        return prev;
      }
      if (prev.busyReason === "ops") return prev;
      if (prev.busyReason === "idle") return prev;
      return patchLocked(prev, { busyReason: "idle" });
    });
  }, []);

  const seedBoot = useCallback(
    (opts: {
      message: string;
      stageId?: BootStageId | null;
      percent?: number | null;
      clearLog?: boolean;
      keepIdle?: boolean;
    }) => {
      setState((prev) => {
        const nextBusy: BusyReason = opts.keepIdle
          ? "idle"
          : prev.busyReason === "ops"
            ? "ops"
            : prev.busyReason === "idle"
              ? "boot"
              : prev.busyReason;
        return patchLocked(prev, {
          stageId: opts.stageId ?? prev.stageId ?? "detect",
          message: opts.message,
          percent: opts.percent !== undefined ? opts.percent : prev.percent,
          logLines: opts.clearLog
            ? pushLogLine([], opts.message)
            : pushLogLine(prev.logLines, opts.message),
          busyReason: nextBusy,
        });
      });
    },
    [],
  );

  const resetIdle = useCallback((opts?: { clearProgress?: boolean }) => {
    setState((prev) => {
      if (opts?.clearProgress) {
        return patchLocked(prev, { ...INITIAL, busyReason: "idle" });
      }
      return patchLocked(prev, { busyReason: "idle" });
    });
  }, []);

  const setBootFault = useCallback((message: string | null) => {
    setState((prev) =>
      patchLocked(prev, { bootFault: { message } }),
    );
  }, []);

  const setBootMeta = useCallback((partial: Partial<BootMeta>) => {
    setState((prev) =>
      patchLocked(prev, {
        bootMeta: { ...prev.bootMeta, ...partial },
      }),
    );
  }, []);

  const clearBootFault = useCallback(() => {
    setState((prev) =>
      patchLocked(prev, { bootFault: INITIAL_BOOT_FAULT }),
    );
  }, []);

  const value = useMemo<HostLifecycleApi>(
    () => ({
      ...state,
      beginOps,
      endOps,
      syncSessionPhase,
      seedBoot,
      resetIdle,
      setBootFault,
      setBootMeta,
      clearBootFault,
    }),
    [
      state,
      beginOps,
      endOps,
      syncSessionPhase,
      seedBoot,
      resetIdle,
      setBootFault,
      setBootMeta,
      clearBootFault,
    ],
  );

  return (
    <HostLifecycleContext.Provider value={value}>
      {children}
    </HostLifecycleContext.Provider>
  );
}

export function useHostLifecycle(): HostLifecycleApi {
  const ctx = useContext(HostLifecycleContext);
  if (!ctx) {
    throw new Error("useHostLifecycle 须在 HostLifecycleProvider 内使用");
  }
  return ctx;
}
