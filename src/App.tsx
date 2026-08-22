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
  useChrome,
  useHostLifecycle,
  usePlatformWebview,
  useShellProgressBubble,
  useShellSession,
  useSidebarLayout,
  useHarnessContextMenu,
} from "./shell";
import "./App.css";

/** 托盘恢复时清掉 :hover 残留（关闭钮曾压在鼠标下） */
function suppressHoverResidue() {
  document.body.classList.add("suppress-hover");
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
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

  const onSessionLog = useCallback(() => {
    postSessionLogClick(harnessFrameRef.current);
  }, []);

  const shellOverlay = chrome.titlebarCompact && bodyView === "harness";
  const showHarness =
    session.showIframe && !!session.serviceUrl;
  const harnessVisible = bodyView === "harness";
  const platformWebviewActive =
    bodyView === "platform" && !settingsOpen && !closeAskOpen;

  const contextMenuEnabled =
    harnessVisible && showHarness && !settingsOpen && !closeAskOpen;
  const { menu: contextMenu, close: closeContextMenu, selectAction, copyToastMessage, copyToastLeaving, copyToastVisible } =
    useHarnessContextMenu(harnessFrameRef, contextMenuEnabled, settingsOpen);

  usePlatformWebview(platformWebviewActive, shellBodyEl, resolvedTheme);

  return (
    <div className={`shell${shellOverlay ? " titlebar-overlay" : ""}`}>
      <ShellTitleBar
        port={session.port}
        conn={session.titleConn}
        chrome={chrome}
        sidebarWidthPx={sidebarWidthPx}
        bodyView={bodyView}
        onBackFromPlatform={backFromPlatform}
        onOpenSettings={() => openSettings()}
        onSessionLog={onSessionLog}
        onRestart={session.restart}
        onStop={() => void session.stop()}
        onOpenDshHome={() => {
          void shellApi.openKnownPath("dshHome").catch((e) => console.error(e));
        }}
        onOpenLogs={() => {
          void shellApi.openKnownPath("logs").catch((e) => console.error(e));
        }}
        onHideToTray={() => {
          void shellApi.hideToTray().catch((e) => console.error(e));
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
              console.error(e);
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
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              session.markIframeConnected();
              const frame = harnessFrameRef.current;
              postSelectionHygiene(frame, chrome.selectionHygiene);
              postSessionLogProxy(
                frame,
                chrome.titlebarCompact && chrome.sessionLogInTitlebar,
              );
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
