/**
 * 壳会话单一 FSM：连接 / 嵌入 / 失败 / 停止 / 重启。
 * BootPanel 只负责冷启动安装 UI；不再向上维护第二套 conn。
 */

import { useCallback, useRef, useState } from "react";
import type {
  SessionPhase,
  StartCommand,
  TitleConn,
  ReadyPayload,
} from "../types/ipc-types";
import { stopHarness } from "../api/shellApi";
import { shellLog } from "../logger";
import {
  readCachedResolvedThemeForIframe,
  RESOLVED_THEME_CACHE_KEY,
} from "../themeBootstrap";

function withCacheBust(url: string): string {
  let canvas = "dark";
  try {
    const cached = localStorage.getItem(RESOLVED_THEME_CACHE_KEY);
    if (cached === "light" || cached === "dark") {
      canvas = cached;
    } else {
      canvas = readCachedResolvedThemeForIframe();
    }
  } catch {
    canvas = readCachedResolvedThemeForIframe();
  }
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}&shellCanvas=${canvas}`;
}

export function useShellSession() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const phaseRef = useRef<SessionPhase>("idle");
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [startCommand, setStartCommand] =
    useState<StartCommand>("ensure_and_start");
  const [iframeKey, setIframeKey] = useState(0);
  const [bootStealth, setBootStealth] = useState(false);
  const [bootMsg, setBootMsg] = useState("正在准备…");
  const [bootError, setBootError] = useState<string | null>(null);

  const transitionPhase = useCallback(
    (to: SessionPhase, reason?: string) => {
      const from = phaseRef.current;
      if (from !== to) {
        shellLog.transition("session", from, to, reason);
      }
      phaseRef.current = to;
      setPhase(to);
    },
    [],
  );

  const markReady = useCallback((payload: ReadyPayload) => {
    shellLog.info("session", "ready", { port: payload.port });
    setBootError(null);
    setStartCommand("ensure_and_start");
    setServiceUrl(withCacheBust(payload.url));
    setPort(payload.port);
    transitionPhase("ready");
    setBootStealth(false);
    setIframeKey((k) => k + 1);
  }, [transitionPhase]);

  const markFailed = useCallback((error?: string) => {
    transitionPhase("failed", error ?? "unknown");
    if (error) {
      shellLog.op("boot.failed", { reason: error }, "err");
      setBootError(error);
    } else {
      shellLog.warn("session", "phase failed without reason");
    }
    setServiceUrl(null);
    setBootStealth(false);
  }, [transitionPhase]);

  const markIframeConnected = useCallback(() => {
    shellLog.info("session", "iframe connected");
    transitionPhase("ready", "iframe_onload");
  }, [transitionPhase]);

  const markIframeError = useCallback(() => {
    const reason = "HEALTH_TIMEOUT: 官方 UI 加载失败";
    transitionPhase("failed", reason);
    setServiceUrl(null);
    setBootStealth(false);
    setBootError(reason);
    shellLog.op("boot.failed", { reason }, "err");
  }, [transitionPhase]);

  /** BootPanel 进入工作态时：冷启动=installing，快路径=spawning */
  const markBootWorking = useCallback((coldInstall: boolean) => {
    setBootError(null);
    transitionPhase(coldInstall ? "installing" : "spawning", coldInstall ? "cold_install" : "fast_path");
  }, [transitionPhase]);

  const restart = useCallback(() => {
    shellLog.op("session.restart");
    transitionPhase("idle", "user_restart");
    setServiceUrl(null);
    setBootStealth(false);
    setBootError(null);
    setStartCommand("restart_harness");
    setBootKey((k) => k + 1);
  }, [transitionPhase]);

  /** 设置页发起 reset/reinstall 等：隐藏 iframe，进入 stealth 启动态，勿重复 auto-start */
  const beginHarnessOp = useCallback(() => {
    shellLog.op("session.harness_op");
    setBootError(null);
    setServiceUrl(null);
    setPort(null);
    transitionPhase("spawning", "external_op");
    setBootStealth(true);
    setStartCommand("external_op");
    setBootKey((k) => k + 1);
  }, [transitionPhase]);

  /** 停止托管进程；进入 stopped（Boot 可手动启，禁止自动 ensure） */
  const stop = useCallback(async () => {
    shellLog.op("session.stop");
    try {
      await stopHarness();
      shellLog.op("session.stop", undefined, "ok");
    } catch (e) {
      shellLog.error("session", "stop harness", e);
      shellLog.op("session.stop", undefined, "err");
    }
    transitionPhase("stopped", "user_stop");
    setServiceUrl(null);
    setPort(null);
    setBootStealth(false);
    setBootError(null);
    setBootMsg("已停止 harness");
    setStartCommand("ensure_and_start");
    setBootKey((k) => k + 1);
  }, [transitionPhase]);

  // stopped 非错误：内容区状态面接管；顶栏不标红
  const titleConn: TitleConn =
    phase === "ready"
      ? "connected"
      : phase === "failed"
        ? "error"
        : "preparing";

  const showBootPanel =
    phase === "idle" ||
    phase === "installing" ||
    phase === "spawning" ||
    phase === "embedding" ||
    phase === "failed" ||
    phase === "stopped";

  const showIframe = phase === "ready" && serviceUrl != null;

  /** B47：进度只进内容区，不再替换顶栏产品名 */
  const titleActivity: string | null = null;

  /** stopped：禁止 BootPanel 自动 ensure；其余冷启路径仍自动 */
  const bootAutoStart = phase !== "stopped";

  return {
    phase,
    serviceUrl,
    port,
    bootKey,
    startCommand,
    iframeKey,
    bootStealth,
    bootMsg,
    bootError,
    bootAutoStart,
    setBootStealth,
    setBootMsg,
    markReady,
    markFailed,
    markBootWorking,
    markIframeConnected,
    markIframeError,
    restart,
    beginHarnessOp,
    stop,
    titleConn,
    showBootPanel,
    showIframe,
    titleActivity,
  };
}
