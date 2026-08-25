/**
 * 壳会话单一 FSM：连接 / 嵌入 / 失败 / 停止 / 重启。
 * BootPanel 只负责冷启动安装 UI；不再向上维护第二套 conn。
 */

import { useCallback, useState } from "react";
import type {
  SessionPhase,
  StartCommand,
  TitleConn,
  ReadyPayload,
} from "../types/ipc-types";
import { stopHarness } from "../api/shellApi";
import { shellLog } from "../logger";

function withCacheBust(url: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

export function useShellSession() {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [startCommand, setStartCommand] =
    useState<StartCommand>("ensure_and_start");
  const [iframeKey, setIframeKey] = useState(0);
  const [bootStealth, setBootStealth] = useState(false);
  const [bootMsg, setBootMsg] = useState("正在准备…");
  const [bootError, setBootError] = useState<string | null>(null);

  const markReady = useCallback((payload: ReadyPayload) => {
    shellLog.info("session", `ready port=${payload.port}`);
    setBootError(null);
    setStartCommand("ensure_and_start");
    setServiceUrl(withCacheBust(payload.url));
    setPort(payload.port);
    setPhase("ready");
    setBootStealth(false);
    setIframeKey((k) => k + 1);
  }, []);

  const markFailed = useCallback((error?: string) => {
    shellLog.warn("session", "phase failed");
    setPhase("failed");
    setServiceUrl(null);
    setBootStealth(false);
    if (error) setBootError(error);
  }, []);

  const markIframeConnected = useCallback(() => {
    shellLog.info("session", "iframe connected");
    setPhase("ready");
  }, []);

  const markIframeError = useCallback(() => {
    setPhase("failed");
    setServiceUrl(null);
    setBootStealth(false);
    setBootError("HEALTH_TIMEOUT: 官方 UI 加载失败");
  }, []);

  /** BootPanel 进入工作态时：冷启动=installing，快路径=spawning */
  const markBootWorking = useCallback((coldInstall: boolean) => {
    shellLog.info("session", coldInstall ? "boot installing" : "boot spawning");
    setBootError(null);
    setPhase(coldInstall ? "installing" : "spawning");
  }, []);

  const restart = useCallback(() => {
    setPhase("idle");
    setServiceUrl(null);
    setBootStealth(false);
    setBootError(null);
    setStartCommand("restart_harness");
    setBootKey((k) => k + 1);
  }, []);

  /** 设置页发起 reset/reinstall 等：隐藏 iframe，进入 stealth 启动态，勿重复 auto-start */
  const beginHarnessOp = useCallback(() => {
    setBootError(null);
    setServiceUrl(null);
    setPort(null);
    setPhase("spawning");
    setBootStealth(true);
    setStartCommand("external_op");
    setBootKey((k) => k + 1);
  }, []);

  /** 停止托管进程；进入 stopped（Boot 可手动启，禁止自动 ensure） */
  const stop = useCallback(async () => {
    try {
      await stopHarness();
    } catch (e) {
      shellLog.error("session", "stop harness", e);
    }
    setPhase("stopped");
    setServiceUrl(null);
    setPort(null);
    setBootStealth(false);
    setBootError(null);
    setBootMsg("已停止 harness");
    setStartCommand("ensure_and_start");
    setBootKey((k) => k + 1);
  }, []);

  const titleConn: TitleConn =
    phase === "ready"
      ? "connected"
      : phase === "failed" || phase === "stopped"
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

  const titleActivity =
    showBootPanel &&
    phase !== "failed" &&
    phase !== "stopped" &&
    phase !== "embedding"
      ? bootMsg
      : phase === "stopped"
        ? bootMsg
        : null;

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
