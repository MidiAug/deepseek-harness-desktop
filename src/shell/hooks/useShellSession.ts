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
import { useHostLifecycle } from "../contexts/HostLifecycleProvider";
import { clearBootError, recordBootError } from "../diagnosticsContext";
import { shellLog } from "../logger";
import { setLinkedHarnessStart } from "../sessionOpLink";
import {
  deriveShowBootPanel,
  deriveShowIframe,
} from "../sessionPhase";
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
  const { setBootFault, clearBootFault } = useHostLifecycle();
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const phaseRef = useRef<SessionPhase>("idle");
  const [serviceUrl, setServiceUrl] = useState<string | null>(null);
  const [port, setPort] = useState<number | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const [startCommand, setStartCommand] =
    useState<StartCommand>("ensure_and_start");
  const [iframeKey, setIframeKey] = useState(0);

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
    clearBootError();
    clearBootFault();
    shellLog.info("session", "ready", { port: payload.port });
    setStartCommand("ensure_and_start");
    setServiceUrl(withCacheBust(payload.url));
    setPort(payload.port);
    transitionPhase("embedding", "service_ready");
    setIframeKey((k) => k + 1);
  }, [transitionPhase, clearBootFault]);

  const markFailed = useCallback((error?: string) => {
    transitionPhase("failed", error ?? "unknown");
    if (error) {
      recordBootError(error);
      setBootFault(error);
      shellLog.op("boot.failed", { reason: error }, "err");
    } else {
      shellLog.warn("session", "phase failed without reason");
    }
    setServiceUrl(null);
  }, [transitionPhase, setBootFault]);

  const markIframeConnected = useCallback(() => {
    shellLog.info("session", "iframe connected");
    transitionPhase("ready", "iframe_health_ok");
  }, [transitionPhase]);

  const markIframeError = useCallback(() => {
    const reason = "HEALTH_TIMEOUT: 官方 UI 加载失败";
    transitionPhase("failed", reason);
    setServiceUrl(null);
    setBootFault(reason);
    recordBootError(reason);
    shellLog.op("boot.failed", { reason }, "err");
  }, [transitionPhase, setBootFault]);

  /** BootPanel 进入工作态时：冷启动=installing，快路径=spawning */
  const markBootWorking = useCallback((coldInstall: boolean) => {
    clearBootFault();
    transitionPhase(coldInstall ? "installing" : "spawning", coldInstall ? "cold_install" : "fast_path");
  }, [transitionPhase, clearBootFault]);

  const restart = useCallback((linkedOpId?: string, action = "session.restart") => {
    const opId = linkedOpId ?? shellLog.opBegin(action);
    setLinkedHarnessStart({ opId, action });
    transitionPhase("idle", "user_restart");
    setServiceUrl(null);
    clearBootFault();
    setStartCommand("restart_harness");
    setBootKey((k) => k + 1);
  }, [transitionPhase, clearBootFault]);

  /** 设置页发起 reset/reinstall 等：隐藏 iframe，进入 stealth 启动态，勿重复 auto-start */
  const beginHarnessOp = useCallback(() => {
    shellLog.op("session.harness_op");
    clearBootFault();
    setServiceUrl(null);
    setPort(null);
    transitionPhase("spawning", "external_op");
    setStartCommand("external_op");
    setBootKey((k) => k + 1);
  }, [transitionPhase, clearBootFault]);

  /** 停止托管进程；进入 stopped（Boot 可手动启，禁止自动 ensure） */
  const stop = useCallback(async (linkedOpId?: string, action = "session.stop") => {
    const opId = linkedOpId ?? shellLog.opBegin(action);
    try {
      await stopHarness(opId);
      shellLog.opEnd(opId, action, "ok");
    } catch (e) {
      shellLog.error("session", "stop harness", e);
      shellLog.opEnd(opId, action, "err");
    }
    transitionPhase("stopped", "user_stop");
    setServiceUrl(null);
    setPort(null);
    clearBootFault();
    setStartCommand("ensure_and_start");
    setBootKey((k) => {
      const next = k + 1;
      shellLog.info("session", "boot panel remount scheduled", {
        bootKey: next,
        reason: "user_stop",
        autoStart: false,
        note: "harness stopped; shell UI still on localhost",
      });
      return next;
    });
  }, [transitionPhase, clearBootFault]);

  // stopped 非错误：内容区状态面接管；顶栏不标红
  const titleConn: TitleConn =
    phase === "ready"
      ? "connected"
      : phase === "failed"
        ? "error"
        : "preparing";

  const showBootPanel = deriveShowBootPanel(phase);

  const showIframe = deriveShowIframe(phase, serviceUrl);

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
    bootAutoStart,
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
