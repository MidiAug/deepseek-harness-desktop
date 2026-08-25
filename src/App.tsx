import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BootPanel } from "./components/boot/BootPanel";
import { OnboardingWizard } from "./components/boot/OnboardingWizard";
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
  useChrome,
  useHostLifecycle,
  useLocale,
  usePlatformWebview,
  useShellSession,
  useSidebarLayout,
  useHarnessContextMenu,
  useSessionLogDownload,
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
  suppressHoverResidue,
} from "./shell/harnessFrameBridge";
import "./App.css";

export default function App() {
  const { t } = useLocale();
  const session = useShellSession();
  const life = useHostLifecycle();
  const { syncSessionPhase } = life;
  const { sidebarWidthPx } = useSidebarLayout(session.iframeKey);
  const { chrome, resolvedTheme } = useChrome();
  const harnessFrameRef = useRef<HTMLIFrameElement | null>(null);
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
    "loading" | "wizard" | "ready"
  >("loading");
  const [sessionLogAvailable, setSessionLogAvailable] = useState(false);
  const { onSessionLog, resetSessionLogPending } = useSessionLogDownload(
    harnessFrameRef,
  );

  const openSettings = useCallback((section?: SettingsSection) => {
    // 延后到当前 click 冒泡结束后再挂遮罩，避免同次点击打到 backdrop 立刻关闭
    window.setTimeout(() => {
      setSettingsSection(section);
      setSettingsOpen(true);
    }, 0);
  }, []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    setSettingsSection(undefined);
  }, []);

  const openPlatform = useCallback(() => {
    setBodyView("platform");
  }, []);
  const backFromPlatform = useCallback(() => {
    setBodyView("harness");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void shellApi.getShellSettings().then((s) => {
      if (cancelled) return;
      setOnboardingGate(s.onboardingDone ? "ready" : "wizard");
    }).catch((e) => {
      shellLog.error("app", "onboarding gate", e);
      if (!cancelled) setOnboardingGate("ready");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    syncSessionPhase(session.phase);
  }, [session.phase, syncSessionPhase]);

  useEffect(() => {
    let unAsk: (() => void) | undefined;
    let unFocus: (() => void) | undefined;
    let unPlatform: (() => void) | undefined;

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
    };
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
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

  // 换页 / 重载 iframe 时先隐藏，等 harness 再上报
  useEffect(() => {
    setSessionLogAvailable(false);
    resetSessionLogPending();
  }, [session.iframeKey, bodyView, resetSessionLogPending]);

  const shellOverlay = chrome.titlebarCompact && bodyView === "harness";
  const shellBackdropOpen = settingsOpen || closeAskOpen;

  useEffect(() => {
    document.body.classList.toggle("shell-modal-open", shellBackdropOpen);
    return () => document.body.classList.remove("shell-modal-open");
  }, [shellBackdropOpen]);

  const showBootChrome = onboardingGate === "ready";
  const onboardingActive = onboardingGate !== "ready";
  const opsActive = life.busyReason === "ops";
  const titleFailed =
    session.phase === "failed" || session.phase === "stopped";
  const titleActivity = titleFailed
    ? t("chrome.conn.failed")
    : opsActive && life.message
      ? life.message
      : onboardingGate === "loading"
        ? t("onboarding.loading")
        : session.titleActivity;
  const titleActivityTone = titleFailed ? "error" : "busy";
  const showHarness =
    session.showIframe && !!session.serviceUrl;
  const harnessVisible = bodyView === "harness";

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
        hideConnStatus={!showBootChrome}
        titleActivity={titleActivity}
        titleActivityTone={titleActivity ? titleActivityTone : undefined}
        minimal={onboardingActive}
        chrome={chrome}
        sidebarWidthPx={sidebarWidthPx}
        bodyView={bodyView}
        onBackFromPlatform={backFromPlatform}
        onOpenSettings={() => openSettings()}
        onSessionLog={onSessionLog}
        sessionLogAvailable={sessionLogAvailable}
        onRestart={session.restart}
        onStop={() => void session.stop()}
        onOpenDshHome={() => {
          void shellApi.openKnownPath("dshHome").catch((e) => shellLog.error("app", "open dshHome", e));
        }}
        onOpenLogs={() => {
          void shellApi.openKnownPath("logs").catch((e) => shellLog.error("app", "open logs", e));
        }}
        onHideToTray={() => {
          void shellApi.hideToTray().catch((e) => shellLog.error("app", "hideToTray", e));
        }}
        onAbout={() => openSettings("about")}
        onOpenPlatform={openPlatform}
        onCopyVersion={() => {
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
            forceStealth={opsActive}
            sessionError={session.bootError}
            onReady={session.markReady}
            onError={session.markFailed}
            onBootWorking={session.markBootWorking}
            onOpenSettings={() => openSettings()}
            onStealthChange={session.setBootStealth}
            onStatusMessage={session.setBootMsg}
          />
        )}

        {showHarness && (
          <iframe
            key={session.iframeKey}
            ref={harnessFrameRef}
            className="harness-frame"
            title="DeepSeek Harness"
            src={session.serviceUrl!}
            hidden={!harnessVisible}
            allow="clipboard-read; clipboard-write; downloads"
            onLoad={() => {
              const frame = harnessFrameRef.current;
              postSelectionHygiene(frame, chrome.selectionHygiene);
              postSessionLogProxy(
                frame,
                chrome.titlebarCompact && chrome.sessionLogInTitlebar,
              );
              setHarnessShellModalOpen(frame, shellBackdropOpen);
              if (shellBackdropOpen) clearShellSelections(frame);
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
        onStopHarness={() => session.stop()}
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
