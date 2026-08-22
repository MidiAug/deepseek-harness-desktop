/**
 * 壳会话单一 FSM：连接 / 嵌入 / 失败 / 重启。
 * BootPanel 只负责冷启动安装 UI；不再向上维护第二套 conn。
 */

import { useCallback, useState } from "react";
import type {
  SessionPhase,
  StartCommand,
  TitleConn,
} from "./ipc-types";
import type { ReadyPayload } from "./ipc-types";
import { stopHarness } from "./shellApi";

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

  const markReady = useCallback((payload: ReadyPayload) => {
    setServiceUrl(withCacheBust(payload.url));
    setPort(payload.port);
    setPhase("embedding");
    setBootStealth(false);
    setIframeKey((k) => k + 1);
  }, []);

  const markFailed = useCallback(() => {
    setPhase("failed");
    setServiceUrl(null);
    setBootStealth(false);
  }, []);

  const markIframeConnected = useCallback(() => {
    setPhase("ready");
  }, []);

  const markIframeError = useCallback(() => {
    setPhase("failed");
    setServiceUrl(null);
    setBootStealth(false);
  }, []);

  /** BootPanel 进入工作态时：冷启动=installing，快路径=spawning */
  const markBootWorking = useCallback((coldInstall: boolean) => {
    setPhase(coldInstall ? "installing" : "spawning");
  }, []);

  const restart = useCallback(() => {
    setPhase("idle");
    setServiceUrl(null);
    setBootStealth(false);
    setStartCommand("restart_harness");
    setBootKey((k) => k + 1);
  }, []);

  /** 停止托管进程，回到失败/可重试态 */
  const stop = useCallback(async () => {
    try {
      await stopHarness();
    } catch (e) {
      console.error(e);
    }
    setPhase("failed");
    setServiceUrl(null);
    setBootStealth(false);
    setBootMsg("已停止 harness");
  }, []);

  const titleConn: TitleConn =
    phase === "ready" ? "connected" : phase === "failed" ? "error" : "preparing";

  const showBootPanel =
    phase === "idle" ||
    phase === "installing" ||
    phase === "spawning" ||
    phase === "failed";

  const showIframe =
    (phase === "embedding" || phase === "ready") && serviceUrl != null;

  const wantBubble =
    phase === "embedding" ||
    ((phase === "idle" || phase === "installing" || phase === "spawning") &&
      bootStealth);

  const bubbleMessage =
    phase === "embedding"
      ? port != null
        ? `正在嵌入官方界面 · :${port}`
        : "正在嵌入官方界面…"
      : bootMsg;

  return {
    phase,
    serviceUrl,
    port,
    bootKey,
    startCommand,
    iframeKey,
    bootStealth,
    bootMsg,
    setBootStealth,
    setBootMsg,
    markReady,
    markFailed,
    markBootWorking,
    markIframeConnected,
    markIframeError,
    restart,
    stop,
    titleConn,
    showBootPanel,
    showIframe,
    wantBubble,
    bubbleMessage,
  };
}
