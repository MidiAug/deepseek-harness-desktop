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
import type { ProgressPayload, SessionPhase } from "../types/ipc-types";
import {
  isHeartbeat,
  isLogOnly,
  mapStage,
  pushLogLine,
  type BootStageId,
} from "../hostProgressMap";

export type BusyReason = "idle" | "boot" | "ops" | "progress";

export type HostLifecycleState = {
  stageId: BootStageId | null;
  message: string;
  percent: number | null;
  logLines: string[];
  busyReason: BusyReason;
  locked: boolean;
};

type HostLifecycleApi = HostLifecycleState & {
  beginOps: (initialMsg: string) => void;
  endOps: (opts?: { clearProgress?: boolean }) => void;
  /** App 把 SessionPhase 同步进来，避免 Provider 依赖 useShellSession */
  syncSessionPhase: (phase: SessionPhase) => void;
  /** BootPanel 启动前写入初始文案/阶段 */
  seedBoot: (opts: {
    message: string;
    stageId?: BootStageId | null;
    percent?: number | null;
    clearLog?: boolean;
  }) => void;
  resetIdle: (opts?: { clearProgress?: boolean }) => void;
};

const HostLifecycleContext = createContext<HostLifecycleApi | null>(null);

/** idle/clear 后 message 必须为空，否则关于区会误画「正在准备」进度条 */
const INITIAL: HostLifecycleState = {
  stageId: null,
  message: "",
  percent: null,
  logLines: [],
  busyReason: "idle",
  locked: false,
};

function withLocked(
  partial: Omit<HostLifecycleState, "locked">,
): HostLifecycleState {
  return {
    ...partial,
    locked: partial.busyReason !== "idle",
  };
}

export function HostLifecycleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HostLifecycleState>(INITIAL);
  const sessionBusyRef = useRef(false);

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
        if (mapped) stageId = mapped;
        if (pct != null) {
          percent = pct;
        } else if (mapped === "install-dsh" || isHeartbeat(msg)) {
          percent = percent != null && percent >= 75 ? percent : 75;
        }
      }

      const done = percent != null && percent >= 100 && !keepOps;
      return withLocked({
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
    setState(
      withLocked({
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
        return withLocked({
          ...INITIAL,
          busyReason: "idle",
        });
      }
      if (sessionBusy) {
        return withLocked({
          ...prev,
          busyReason: prev.logLines.length > 0 ? "progress" : "boot",
        });
      }
      return withLocked({
        ...prev,
        busyReason: "idle",
      });
    });
  }, []);

  const syncSessionPhase = useCallback((phase: SessionPhase) => {
    const sessionBusy = phase === "installing" || phase === "spawning";
    sessionBusyRef.current = sessionBusy;
    setState((prev) => {
      if (sessionBusy) {
        if (prev.busyReason === "ops") return prev;
        if (prev.busyReason === "idle") {
          return withLocked({
            ...prev,
            busyReason: "boot",
          });
        }
        return prev;
      }
      // ready / failed / stopped / embedding / idle：非 ops 则放行
      if (prev.busyReason === "ops") return prev;
      if (prev.busyReason === "idle") return prev;
      return withLocked({
        ...prev,
        busyReason: "idle",
      });
    });
  }, []);

  const seedBoot = useCallback(
    (opts: {
      message: string;
      stageId?: BootStageId | null;
      percent?: number | null;
      clearLog?: boolean;
    }) => {
      setState((prev) =>
        withLocked({
          stageId: opts.stageId ?? prev.stageId ?? "detect",
          message: opts.message,
          percent: opts.percent !== undefined ? opts.percent : prev.percent,
          logLines: opts.clearLog
            ? pushLogLine([], opts.message)
            : pushLogLine(prev.logLines, opts.message),
          busyReason:
            prev.busyReason === "ops"
              ? "ops"
              : prev.busyReason === "idle"
                ? "boot"
                : prev.busyReason,
        }),
      );
    },
    [],
  );

  const resetIdle = useCallback((opts?: { clearProgress?: boolean }) => {
    setState((prev) => {
      if (opts?.clearProgress) {
        return withLocked({ ...INITIAL, busyReason: "idle" });
      }
      return withLocked({ ...prev, busyReason: "idle" });
    });
  }, []);

  const value = useMemo<HostLifecycleApi>(
    () => ({
      ...state,
      beginOps,
      endOps,
      syncSessionPhase,
      seedBoot,
      resetIdle,
    }),
    [state, beginOps, endOps, syncSessionPhase, seedBoot, resetIdle],
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
