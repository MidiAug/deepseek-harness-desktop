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
import { useAppToast } from "./ShellToastProvider";

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

/** 仅匹配「真·未配置/开发态」类错误；勿用裸 `dev`（会误伤 URL 里的 desktop） */
function isUpdaterUnsupportedMessage(msg: string): boolean {
  return /not configured|unsupported|no update endpoint|missing pubkey|development build|\bdev mode\b/i.test(
    msg,
  );
}

function shortenUpdaterError(msg: string, max = 120): string {
  const oneLine = msg.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

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

export function ShellUpdateProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const [state, setState] = useState<ShellUpdateState>(INITIAL);
  const updateRef = useRef<Update | null>(null);
  const checkingRef = useRef(false);
  const lastCheckedRef = useRef(0);
  const phaseRef = useRef<ShellUpdatePhase>(INITIAL.phase);
  const installRef = useRef<() => Promise<void>>(async () => {});

  const apply = useCallback((patch: Partial<ShellUpdateState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      phaseRef.current = next.phase;
      return next;
    });
  }, []);

  const runCheck = useCallback(
    async (manual = false) => {
      if (checkingRef.current) return;
      const phase = phaseRef.current;
      if (
        !manual &&
        (phase === "available" ||
          phase === "downloading" ||
          phase === "downloaded" ||
          phase === "installing")
      ) {
        return;
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
          if (manual) {
            showToast(t("shell.update.upToDate"));
            apply({
              phase: "upToDate",
              version: null,
              notes: null,
              message: t("shell.update.upToDate"),
              percent: null,
            });
          } else {
            apply({
              phase: "idle",
              version: null,
              notes: null,
              message: null,
              percent: null,
              manual: false,
            });
          }
          return;
        }

        updateRef.current = update;
        const foundMsg = t("shell.update.available", { version: update.version });
        showToast(foundMsg);
        apply({
          phase: "available",
          currentVersion: update.currentVersion,
          version: update.version,
          notes: update.body ?? null,
          message: foundMsg,
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

        const readyMsg = t("shell.update.downloaded", { version: update.version });
        apply({
          phase: "downloaded",
          percent: 100,
          message: readyMsg,
        });
        // 自动检查下完：Toast 带「重启」；手动检查时关于页已有同按钮，避免叠两层强提示
        if (!manual) {
          showToast(readyMsg, {
            action: {
              label: t("settings.about.shellUpdate.install"),
              onClick: () => {
                void installRef.current();
              },
            },
          });
        }
      } catch (e) {
        const msg = typeof e === "string" ? e : String(e);
        const unsupported =
          isUpdaterUnsupportedMessage(msg) || import.meta.env.DEV;
        updateRef.current = null;
        if (unsupported) {
          apply({
            phase: "unsupported",
            message: t("shell.update.unsupported"),
            percent: null,
          });
          if (manual) {
            showToast(t("shell.update.unsupported"));
          }
        } else {
          const short = shortenUpdaterError(msg);
          apply({
            phase: "error",
            message: short,
            percent: null,
          });
          if (manual) {
            showToast(t("shell.update.checkFailed", { error: short }));
          }
        }
      } finally {
        checkingRef.current = false;
      }
    },
    [apply, showToast, t],
  );

  const checkNow = useCallback(
    async (manual = true) => {
      await runCheck(manual);
    },
    [runCheck],
  );

  const installAndRelaunch = useCallback(async () => {
    const update = updateRef.current;
    if (!update || phaseRef.current !== "downloaded") return;
    apply({ phase: "installing", message: t("shell.update.installPrepare") });
    try {
      // 先杀树再装，避免 DSH 未关导致更新失败
      await prepareShellUpdate();
      apply({ phase: "installing", message: t("shell.update.installing") });
      await update.install();
      await relaunch();
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      apply({
        phase: "error",
        message: msg,
      });
      showToast(t("shell.update.checkFailed", { error: msg }));
    }
  }, [apply, showToast, t]);

  installRef.current = installAndRelaunch;

  const dismiss = useCallback(() => {
    if (
      phaseRef.current === "upToDate" ||
      phaseRef.current === "error"
    ) {
      apply({ phase: "idle", message: null, manual: false });
    }
  }, [apply]);

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
