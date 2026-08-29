import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BootPanel } from "./components/boot/BootPanel";
import { OnboardingWizard } from "./components/boot/OnboardingWizard";
import { SessionStatusSurface } from "./components/boot/SessionStatusSurface";
import { CloseAskDialog } from "./components/chrome/CloseAskDialog";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/settings/SettingsModal";
import { ShellContextMenu } from "./components/chrome/ShellContextMenu";
import { ShellTitleBar } from "./components/titlebar/ShellTitleBar";
import type { ShellBodyView } from "./components/titlebar/titlebarTypes";
import { ShellUpdateBanner } from "./components/chrome/ShellUpdateBanner";
import {
  shellApi,
  shellLog,
  setAppStateSnapshot,
  useChrome,
  useHostLifecycle,
  useLocale,
  usePlatformWebview,
  useShellSession,
  useSidebarLayout,
  useHarnessContextMenu,
  useSessionLogDownload,
  useAppToast,
} from "./shell";
import {
  clearShellSelections,
  focusHarnessFrame,
  requestHarnessSelectAll,
  setHarnessShellModalOpen,
} from "./shell/harnessFramePost";
import {
  postSelectionHygiene,
  postSessionLogProxy,
  postSelectionTrace,
  suppressHoverResidue,
} from "./shell/harnessFrameBridge";
import { isHarnessFrameMessage } from "./shell/bridge/harnessMessage";
import { useHarnessIframeHealth } from "./shell/hooks/useHarnessIframeHealth";
import { installShellAuditSurface } from "./shell/auditSurface";
import "./App.css";

export default function App() {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const session = useShellSession();
  const life = useHostLifecycle();
  const { syncSessionPhase } = life;
  const harnessFrameRef = useRef<HTMLIFrameElement | null>(null);
  const { sidebarWidthPx } = useSidebarLayout(session.iframeKey, harnessFrameRef);
  const { chrome, resolvedTheme } = useChrome();
  const [shellBodyEl, setShellBodyEl] = useState<HTMLDivElement | null>(null);
  const shellBodyRef = useCallback((node: HTMLDivElement | null) => {
    setShellBodyEl(node);
  }, []);

  const [bodyView, setBodyView] = useState<ShellBodyView>("harness");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    SettingsSection | undefined
  >(undefined);
  const [closeAskOpen, setCloseAskOpen] = useState(false);
  const [onboardingGate, setOnboardingGate] = useState<
    "loading" | "wizard" | "ready" | "fault"
  >("loading");
  const onboardingLoadGen = useRef(0);
  const [sessionLogAvailable, setSessionLogAvailable] = useState(false);
  const [iframeRevealed, setIframeRevealed] = useState(false);
  const { onSessionLog, resetSessionLogPending } = useSessionLogDownload(
    harnessFrameRef,
  );

  const openSettings = useCallback((section?: SettingsSection) => {
    shellLog.op("nav.settings.open", { section: section ?? "default" });
    // 延后到当前 click 冒泡结束后再挂遮罩，避免同次点击打到 backdrop 立刻关闭
    window.setTimeout(() => {
      setSettingsSection(section);
      setSettingsOpen(true);
    }, 0);
  }, []);
  const closeSettings = useCallback(() => {
    shellLog.op("nav.settings.close");
    setSettingsOpen(false);
    setSettingsSection(undefined);
  }, []);

  const openPlatform = useCallback(() => {
    shellLog.op("nav.platform.open");
    setBodyView("platform");
  }, []);
  const backFromPlatform = useCallback(() => {
    shellLog.op("nav.platform.back");
    setBodyView("harness");
  }, []);

  const loadOnboardingGate = useCallback(async () => {
    const gen = ++onboardingLoadGen.current;
    setOnboardingGate("loading");
    try {
      const s = await shellApi.getShellSettings();
      if (gen !== onboardingLoadGen.current) return;
      setOnboardingGate(s.onboardingDone ? "ready" : "wizard");
    } catch (e) {
      shellLog.error("app", "onboarding gate", e);
      if (gen !== onboardingLoadGen.current) return;
      setOnboardingGate("fault");
    }
  }, []);

  useEffect(() => {
    void loadOnboardingGate();
  }, [loadOnboardingGate]);

  useEffect(() => {
    syncSessionPhase(session.phase);
  }, [session.phase, syncSessionPhase]);

  useEffect(() => {
    setAppStateSnapshot({
      sessionPhase: session.phase,
      onboardingGate,
      bodyView,
      port: session.port,
      settingsOpen,
      closeAskOpen,
    });
  }, [
    session.phase,
    session.port,
    onboardingGate,
    bodyView,
    settingsOpen,
    closeAskOpen,
  ]);

  const lifeRef = useRef(life);
  lifeRef.current = life;

  useEffect(() => {
    return installShellAuditSurface(() => ({
      bootFault: lifeRef.current.bootFault.message,
      harnessIframeSrc: harnessFrameRef.current?.src ?? null,
    }));
  }, []);

  useEffect(() => {
    let unAsk: (() => void) | undefined;
    let unFocus: (() => void) | undefined;
    let unPlatform: (() => void) | undefined;
    let unOrphan: (() => void) | undefined;

    void listen("shell-ask-close", () => {
      setCloseAskOpen(true);
    }).then((fn) => {
      unAsk = fn;
    });

    void listen("shell-open-platform", () => {
      setBodyView("platform");
    }).then((fn) => {
      unPlatform = fn;
    });

    void listen("orphan-swept", () => {
      showToast(t("shell.orphanSwept"));
      shellLog.info("boot", "orphan-swept toast");
    }).then((fn) => {
      unOrphan = fn;
    });

    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) suppressHoverResidue();
      })
      .then((fn) => {
        unFocus = fn;
      });

    return () => {
      unAsk?.();
      unFocus?.();
      unPlatform?.();
      unOrphan?.();
    };
  }, [showToast, t]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!isHarnessFrameMessage(ev, harnessFrameRef.current)) return;
      const d = ev.data;
      if (!d || d.source !== "dsh-harness" || d.type !== "session-log-available") {
        return;
      }
      setSessionLogAvailable(d.available === true);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 设置变更后同步注入开关
  useEffect(() => {
    if (bodyView !== "harness") return;
    const frame = harnessFrameRef.current;
    postSelectionHygiene(frame, chrome.selectionHygiene);
    postSelectionTrace(frame);
    postSessionLogProxy(
      frame,
      chrome.titlebarCompact && chrome.sessionLogInTitlebar,
    );
  }, [
    chrome.selectionHygiene,
    chrome.titlebarCompact,
    chrome.sessionLogInTitlebar,
    bodyView,
    session.iframeKey,
  ]);

  // 换页时重置 session log；iframe 仅在重载（iframeKey）时先隐藏
  useEffect(() => {
    setSessionLogAvailable(false);
    resetSessionLogPending();
  }, [session.iframeKey, bodyView, resetSessionLogPending]);

  useEffect(() => {
    setIframeRevealed(false);
  }, [session.iframeKey]);

  const shellOverlay = chrome.titlebarCompact && bodyView === "harness";
  const shellBackdropOpen = settingsOpen || closeAskOpen;

  useEffect(() => {
    document.body.classList.toggle("shell-modal-open", shellBackdropOpen);
    return () => document.body.classList.remove("shell-modal-open");
  }, [shellBackdropOpen]);

  const onboardingActive = onboardingGate !== "ready";
  const bootPanelActive =
    onboardingGate === "ready" &&
    bodyView === "harness" &&
    (session.phase === "idle" ||
      session.phase === "installing" ||
      session.phase === "spawning" ||
      session.phase === "embedding");
  const titlebarLocked = onboardingActive || bootPanelActive;
  const opsActive = life.busyReason === "ops";
  // B47：顶栏零状态文案；探测/启停进度只在内容区 SessionStatusSurface
  const showHarness =
    session.showIframe && !!session.serviceUrl;
  const harnessVisible = bodyView === "harness";
  const embeddingActive = session.phase === "embedding";

  // 从平台页返回：session 已 ready 时不会再走 embedding reveal
  useEffect(() => {
    if (harnessVisible && showHarness && session.phase === "ready") {
      setIframeRevealed(true);
    }
  }, [harnessVisible, showHarness, session.phase]);

  const { onIframeLoad: onHarnessIframeLoad } = useHarnessIframeHealth({
    active: showHarness && harnessVisible && embeddingActive,
    serviceUrl: session.serviceUrl,
    iframeKey: session.iframeKey,
    onConnected: () => {
      session.markIframeConnected();
      setIframeRevealed(true);
    },
    onFailed: session.markIframeError,
  });

  // embedding 阶段探活超时前的视觉兜底（非健康判定）
  useEffect(() => {
    if (!showHarness || !harnessVisible || iframeRevealed || !embeddingActive) {
      return;
    }
    const timer = window.setTimeout(() => {
      setIframeRevealed(true);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [
    showHarness,
    harnessVisible,
    iframeRevealed,
    embeddingActive,
    session.iframeKey,
  ]);

  const restartAndCloseSettings = useCallback(
    (linkedOpId?: string, action = "session.restart") => {
      closeSettings();
      session.restart(linkedOpId, action);
    },
    [closeSettings, session.restart],
  );

  // 弹窗开/关：通知 iframe；关闭时焦点回 harness，避免 Ctrl+A 选中壳层
  useEffect(() => {
    const frame = harnessFrameRef.current;
    setHarnessShellModalOpen(frame, shellBackdropOpen);
    if (shellBackdropOpen) {
      clearShellSelections(frame);
      return;
    }
    clearShellSelections(frame);
    if (harnessVisible && showHarness) {
      focusHarnessFrame(frame);
    }
  }, [shellBackdropOpen, session.iframeKey, harnessVisible, showHarness]);

  // 弹窗关闭后若焦点仍留在壳 DOM，拦截 Ctrl+A 并委托 iframe
  useEffect(() => {
    if (!harnessVisible || !showHarness || shellBackdropOpen) return;

    function onShellCtrlA(e: KeyboardEvent) {
      if ((e.key !== "a" && e.key !== "A") || !(e.ctrlKey || e.metaKey)) {
        return;
      }
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          "textarea, input, [contenteditable='true'], [contenteditable='']",
        )
      ) {
        return;
      }
      const frame = harnessFrameRef.current;
      if (!frame || document.activeElement === frame) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      window.getSelection()?.removeAllRanges();
      focusHarnessFrame(frame);
      requestHarnessSelectAll(frame);
    }

    document.addEventListener("keydown", onShellCtrlA, true);
    return () => document.removeEventListener("keydown", onShellCtrlA, true);
  }, [harnessVisible, showHarness, shellBackdropOpen]);

  const platformWebviewActive =
    bodyView === "platform" && !settingsOpen && !closeAskOpen;

  const contextMenuEnabled =
    harnessVisible && showHarness && !settingsOpen && !closeAskOpen;
  const { menu: contextMenu, close: closeContextMenu, selectAction } =
    useHarnessContextMenu(harnessFrameRef, contextMenuEnabled, settingsOpen);

  usePlatformWebview(platformWebviewActive, shellBodyEl, resolvedTheme);

  return (
    <div
      className={`shell${shellOverlay ? " titlebar-overlay" : ""}${shellBackdropOpen ? " shell-backdrop-open" : ""}`}
    >
      <ShellTitleBar
        conn={session.titleConn}
        hideConnStatus
        titleActivity={null}
        minimal={titlebarLocked && !chrome.titlebarCompact}
        controlsOnly={titlebarLocked && !chrome.titlebarCompact}
        compactLocked={titlebarLocked && chrome.titlebarCompact}
        chrome={chrome}
        sidebarWidthPx={sidebarWidthPx}
        bodyView={bodyView}
        onBackFromPlatform={backFromPlatform}
        onOpenSettings={() => openSettings()}
        onSessionLog={onSessionLog}
        sessionLogAvailable={sessionLogAvailable}
        onRestart={() => {
          const opId = shellLog.opBegin("titlebar.restart");
          restartAndCloseSettings(opId, "titlebar.restart");
        }}
        onStop={() => {
          const opId = shellLog.opBegin("titlebar.stop");
          void session.stop(opId, "titlebar.stop");
        }}
        onOpenDshHome={() => {
          shellLog.op("menu.openDshHome");
          void shellApi.openKnownPath("dshHome").catch((e) => shellLog.error("app", "open dshHome", e));
        }}
        onOpenLogs={() => {
          shellLog.op("menu.openLogs");
          void shellApi.openKnownPath("logs").catch((e) => shellLog.error("app", "open logs", e));
        }}
        onHideToTray={() => {
          shellLog.op("menu.hideToTray");
          void shellApi.hideToTray().catch((e) => shellLog.error("app", "hideToTray", e));
        }}
        onAbout={() => openSettings("about")}
        onOpenPlatform={openPlatform}
        onCopyVersion={() => {
          shellLog.op("menu.copyVersion");
          void (async () => {
            try {
              const st = await shellApi.getRuntimeStatus();
              const text = [
                `shell ${st.shellVersion ?? "?"}`,
                `harness ${st.harnessVersion ?? "?"}`,
                `digest ${st.harnessDigest ?? "?"}`,
              ].join(" · ");
              await navigator.clipboard.writeText(text);
            } catch (e) {
              shellLog.error("app", "copy version", e);
            }
          })();
        }}
      />

      {!onboardingActive && <ShellUpdateBanner />}

      <div className="shell-body" ref={shellBodyRef}>
        {onboardingGate === "loading" && (
          <SessionStatusSurface
            message={t("onboarding.loading")}
            working
            surfaceReason="onboarding"
          />
        )}
        {onboardingGate === "fault" && (
          <SessionStatusSurface
            message={t("onboarding.gateFailed")}
            surfaceReason="onboarding_fault"
            awaitingManualStart
            startLabel={t("onboarding.retry")}
            onStartManual={() => void loadOnboardingGate()}
          />
        )}
        {onboardingGate === "wizard" && (
          <OnboardingWizard onComplete={() => setOnboardingGate("ready")} />
        )}
        {bodyView === "harness" &&
          onboardingGate === "ready" &&
          session.showBootPanel && (
          <BootPanel
            key={session.bootKey}
            startCommand={session.startCommand}
            autoStart={session.bootAutoStart}
            forceStealth={opsActive && settingsOpen}
            embedding={embeddingActive}
            onReady={session.markReady}
            onError={session.markFailed}
            onBootWorking={session.markBootWorking}
            onOpenSettings={() => openSettings()}
          />
        )}

        {showHarness && (
          <iframe
            key={session.iframeKey}
            ref={harnessFrameRef}
            className={`harness-frame${iframeRevealed ? " is-revealed" : ""}`}
            title="DeepSeek Harness"
            src={session.serviceUrl!}
            hidden={!harnessVisible}
            allow="clipboard-read; clipboard-write; downloads"
            onLoad={() => {
              const frame = harnessFrameRef.current;
              postSelectionHygiene(frame, chrome.selectionHygiene);
              postSelectionTrace(frame);
              postSessionLogProxy(
                frame,
                chrome.titlebarCompact && chrome.sessionLogInTitlebar,
              );
              setHarnessShellModalOpen(frame, shellBackdropOpen);
              if (shellBackdropOpen) clearShellSelections(frame);
              onHarnessIframeLoad();
            }}
            onError={session.markIframeError}
          />
        )}

      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        initialSection={settingsSection}
        onHarnessReady={session.markReady}
        onBeginHarnessOp={session.beginHarnessOp}
        onHarnessOpFailed={session.markFailed}
        onStopHarness={async (opId, action) => {
          await session.stop(opId, action);
          life.resetIdle({ clearProgress: true });
        }}
        onRestartHarness={restartAndCloseSettings}
        sessionPhase={session.phase}
      />
      <CloseAskDialog open={closeAskOpen} onClose={() => setCloseAskOpen(false)} />
      <ShellContextMenu
        menu={contextMenu}
        onClose={closeContextMenu}
        onSelect={selectAction}
      />
    </div>
  );
}
