import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BootPanel } from "./components/boot/BootPanel";
import { CloseAskDialog } from "./components/chrome/CloseAskDialog";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/settings/SettingsModal";
import { ShellProgressBubble } from "./components/chrome/ShellProgressBubble";
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
  useShellProgressBubble,
  useShellSession,
  useSidebarLayout,
  useHarnessContextMenu,
  useAppToast,
} from "./shell";
import type { DownloadFinishedPayload } from "./shell/api/shellApi";
import {
  clearShellSelections,
  dismissSessionExportDialog,
  focusHarnessFrame,
  requestHarnessSelectAll,
  setHarnessShellModalOpen,
} from "./shell/harnessFramePost";
import "./App.css";

/** 托盘恢复时清掉 :hover 残留（关闭钮曾压在鼠标下） */
function suppressHoverResidue() {
  document.body.classList.add("suppress-hover");
  const active = document.activeElement;
  // 勿 blur harness iframe：窗口重新聚焦时用户常正点选区，blur 会导致灰→蓝→灰闪烁
  if (
    active instanceof HTMLElement &&
    !(active instanceof HTMLIFrameElement)
  ) {
    active.blur();
  }
  window.setTimeout(() => {
    document.body.classList.remove("suppress-hover");
  }, 200);
}

function postSelectionHygiene(
  frame: HTMLIFrameElement | null,
  enabled: boolean,
) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "selection-hygiene", enabled },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}

function postSessionLogProxy(
  frame: HTMLIFrameElement | null,
  enabled: boolean,
) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "session-log-proxy", enabled },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}

function postSessionLogClick(frame: HTMLIFrameElement | null) {
  try {
    frame?.contentWindow?.postMessage(
      { source: "dsh-shell", type: "session-log-click" },
      "*",
    );
  } catch {
    /* cross-origin 或未就绪 */
  }
}

export default function App() {
  const { t } = useLocale();
  const session = useShellSession();
  const { syncSessionPhase } = useHostLifecycle();
  const { sidebarWidthPx } = useSidebarLayout(session.iframeKey);
  const { bubbleVisible, bubbleLeaving } = useShellProgressBubble(
    session.wantBubble,
  );
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
  const [sessionLogAvailable, setSessionLogAvailable] = useState(false);
  const sessionLogDownloadPending = useRef(false);
  const sessionLogDownloadTimer = useRef<number | null>(null);
  const { showToast } = useAppToast();

  const openSettings = useCallback((section?: SettingsSection) => {
    setSettingsSection(section);
    setSettingsOpen(true);
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
    sessionLogDownloadPending.current = false;
    if (sessionLogDownloadTimer.current != null) {
      window.clearTimeout(sessionLogDownloadTimer.current);
      sessionLogDownloadTimer.current = null;
    }
  }, [session.iframeKey, bodyView]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<DownloadFinishedPayload>("shell-download-finished", (ev) => {
      shellLog.info(
        "download",
        `event finished success=${ev.payload.success} path=${ev.payload.path ?? "?"} url=${ev.payload.url ?? "?"}`,
      );
      if (!sessionLogDownloadPending.current) {
        shellLog.info("download", "ignored (no pending session-log click)");
        return;
      }
      sessionLogDownloadPending.current = false;
      if (sessionLogDownloadTimer.current != null) {
        window.clearTimeout(sessionLogDownloadTimer.current);
        sessionLogDownloadTimer.current = null;
      }
      if (!ev.payload.success || !ev.payload.path) {
        shellLog.warn(
          "download",
          `session-log finished but unusable payload success=${ev.payload.success} path=${ev.payload.path ?? ""}`,
        );
        return;
      }
      const filePath = ev.payload.path;
      shellLog.info("download", `session-log toast path=${filePath}`);
      dismissSessionExportDialog(harnessFrameRef.current);
      showToast(t("chrome.sessionLog.downloaded"), {
        action: {
          label: t("chrome.sessionLog.open"),
          onClick: () => {
            shellLog.info("download", `session-log reveal path=${filePath}`);
            dismissSessionExportDialog(harnessFrameRef.current);
            void shellApi.revealDownloadedFile(filePath).catch((e) => {
              shellLog.error("download", `reveal path=${filePath}`, e);
            });
          },
        },
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [showToast, t]);

  const onSessionLog = useCallback(() => {
    shellLog.info("download", "session-log click (pending download toast)");
    sessionLogDownloadPending.current = true;
    if (sessionLogDownloadTimer.current != null) {
      window.clearTimeout(sessionLogDownloadTimer.current);
    }
    sessionLogDownloadTimer.current = window.setTimeout(() => {
      sessionLogDownloadPending.current = false;
      sessionLogDownloadTimer.current = null;
    }, 60_000);
    postSessionLogClick(harnessFrameRef.current);
  }, []);

  const shellOverlay = chrome.titlebarCompact && bodyView === "harness";
  const shellBackdropOpen = settingsOpen || closeAskOpen;
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
  const { menu: contextMenu, close: closeContextMenu, selectAction, copyToastMessage, copyToastAction, copyToastLeaving, copyToastVisible } =
    useHarnessContextMenu(harnessFrameRef, contextMenuEnabled, settingsOpen);

  usePlatformWebview(platformWebviewActive, shellBodyEl, resolvedTheme);

  return (
    <div
      className={`shell${shellOverlay ? " titlebar-overlay" : ""}${shellBackdropOpen ? " shell-backdrop-open" : ""}`}
    >
      <ShellTitleBar
        port={session.port}
        conn={session.titleConn}
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

      <ShellUpdateBanner />

      <div className="shell-body" ref={shellBodyRef}>
        {bodyView === "harness" && session.showBootPanel && (
          <BootPanel
            key={session.bootKey}
            startCommand={session.startCommand}
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
              session.markIframeConnected();
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

        {bodyView === "harness" && bubbleVisible && (
          <ShellProgressBubble
            message={session.bubbleMessage}
            leaving={bubbleLeaving}
          />
        )}

        {copyToastVisible && copyToastMessage && (
          <ShellProgressBubble
            message={copyToastMessage}
            leaving={copyToastLeaving}
            showSpinner={false}
            action={copyToastAction ?? undefined}
          />
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        initialSection={settingsSection}
        onHarnessReady={session.markReady}
        onStopHarness={() => void session.stop()}
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
