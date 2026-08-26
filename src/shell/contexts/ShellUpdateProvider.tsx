/** 壳自更新：启动延迟检查、每 6h 轮询、后台下载、用户确认后安装重启。 */

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
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { prepareShellUpdate } from "../api/shellApi";
import { useLocale } from "../locale";

export type ShellUpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "upToDate"
  | "unsupported"
  | "error";

export type ShellUpdateState = {
  phase: ShellUpdatePhase;
  currentVersion: string;
  version: string | null;
  notes: string | null;
  percent: number | null;
  message: string | null;
  manual: boolean;
};

type ShellUpdateApi = ShellUpdateState & {
  checkNow: (manual?: boolean) => Promise<void>;
  installAndRelaunch: () => Promise<void>;
  dismiss: () => void;
};

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 15_000;
const STARTUP_JITTER_MS = 15_000;

const ShellUpdateContext = createContext<ShellUpdateApi | null>(null);

const INITIAL: ShellUpdateState = {
  phase: "idle",
  currentVersion: "0.1.0",
  version: null,
  notes: null,
  percent: null,
  message: null,
  manual: false,
};

function isBusyPhase(phase: ShellUpdatePhase): boolean {
  return (
    phase === "checking" ||
    phase === "available" ||
    phase === "downloading" ||
    phase === "downloaded" ||
    phase === "installing"
  );
}

export function ShellUpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [state, setState] = useState<ShellUpdateState>(INITIAL);
  const updateRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);
  const lastCheckedRef = useRef(0);

  const apply = useCallback((patch: Partial<ShellUpdateState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const runCheck = useCallback(
    async (manual = false) => {
      if (checkingRef.current) return;
      if (
        !manual &&
        isBusyPhase(state.phase) &&
        state.phase !== "idle" &&
        state.phase !== "upToDate" &&
        state.phase !== "error" &&
        state.phase !== "unsupported"
      ) {
        if (
          state.phase === "available" ||
          state.phase === "downloading" ||
          state.phase === "downloaded"
        ) {
          return;
        }
      }

      checkingRef.current = true;
      apply({
        phase: "checking",
        manual,
        message: manual ? t("shell.update.checking") : null,
        percent: null,
      });
      lastCheckedRef.current = Date.now();

      try {
        const update = await check();
        if (!update) {
          updateRef.current = null;
          apply({
            phase: "upToDate",
            version: null,
            notes: null,
            message: manual ? t("shell.update.upToDate") : null,
            percent: null,
          });
          return;
        }

        updateRef.current = update;
        apply({
          phase: "available",
          currentVersion: update.currentVersion,
          version: update.version,
          notes: update.body ?? null,
          message: t("shell.update.available", { version: update.version }),
          percent: 0,
        });

        // 有更新即后台下载，装前等用户确认
        apply({
          phase: "downloading",
          message: t("shell.update.downloading", { version: update.version }),
        });
        let downloaded = 0;
        let contentLength = 0;
        await update.download((event) => {
          if (event.event === "Started") {
            contentLength = event.data.contentLength ?? 0;
            downloaded = 0;
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            const pct =
              contentLength > 0
                ? Math.min(99, Math.round((downloaded / contentLength) * 100))
                : null;
            apply({
              phase: "downloading",
              percent: pct,
              message: t("shell.update.downloading", { version: update.version }),
            });
          } else if (event.event === "Finished") {
            apply({ phase: "downloading", percent: 100 });
          }
        });

        apply({
          phase: "downloaded",
          percent: 100,
          message: t("shell.update.downloaded", { version: update.version }),
        });
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        const unsupported =
          /not configured|unsupported|endpoints|pubkey|development|dev/i.test(
            msg,
          ) || import.meta.env.DEV;
        updateRef.current = null;
        apply({
          phase: unsupported ? "unsupported" : "error",
          message: unsupported ? t("shell.update.unsupported") : msg,
          percent: null,
        });
      } finally {
        checkingRef.current = false;
      }
    },
    [apply, state.phase, t],
  );

  const checkNow = useCallback(
    async (manual = true) => {
      await runCheck(manual);
    },
    [runCheck],
  );

  const installAndRelaunch = useCallback(async () => {
    const update = updateRef.current;
    if (!update || state.phase !== "downloaded") return;
    apply({ phase: "installing", message: t("shell.update.installPrepare") });
    try {
      // 先杀树再装，避免 DSH 未关导致更新失败
      await prepareShellUpdate();
      apply({ phase: "installing", message: t("shell.update.installing") });
      await update.install();
      await relaunch();
    } catch (e) {
      apply({
        phase: "error",
        message: typeof e === "string" ? e : String(e),
      });
    }
  }, [apply, state.phase, t]);

  const dismiss = useCallback(() => {
    if (state.phase === "upToDate" || state.phase === "error") {
      apply({ phase: "idle", message: null, manual: false });
    }
  }, [apply, state.phase]);

  useEffect(() => {
    // 开发态不自动轮询（无签名端点）；仍可通过关于页手动检查
    if (import.meta.env.DEV) {
      apply({
        phase: "unsupported",
        message: t("shell.update.unsupported"),
      });
      return;
    }
    const startupTimer =
      STARTUP_DELAY_MS + Math.floor(Math.random() * STARTUP_JITTER_MS);
    const startupId = window.setTimeout(() => {
      void runCheck(false);
    }, startupTimer);
    const interval = window.setInterval(() => {
      void runCheck(false);
    }, CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(startupId);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<ShellUpdateApi>(
    () => ({
      ...state,
      checkNow,
      installAndRelaunch,
      dismiss,
    }),
    [state, checkNow, installAndRelaunch, dismiss],
  );

  return (
    <ShellUpdateContext.Provider value={value}>
      {children}
    </ShellUpdateContext.Provider>
  );
}

export function useShellUpdate(): ShellUpdateApi {
  const ctx = useContext(ShellUpdateContext);
  if (!ctx) {
    throw new Error("useShellUpdate 须在 ShellUpdateProvider 内使用");
  }
  return ctx;
}
