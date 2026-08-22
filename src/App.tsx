import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BootPanel } from "./components/BootPanel";
import { CloseAskDialog } from "./components/CloseAskDialog";
import {
  SettingsModal,
  type SettingsSection,
} from "./components/SettingsModal";
import { ShellProgressBubble } from "./components/ShellProgressBubble";
import { ShellTitleBar } from "./components/ShellTitleBar";
import { ShellUpdateBanner } from "./components/ShellUpdateBanner";
import {
  shellApi,
  useChrome,
  useHostLifecycle,
  useShellProgressBubble,
  useShellSession,
  useSidebarLayout,
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

export default function App() {
  const session = useShellSession();
  const { syncSessionPhase } = useHostLifecycle();
  const { sidebarWidthPx } = useSidebarLayout(session.iframeKey);
  const { bubbleVisible, bubbleLeaving } = useShellProgressBubble(
    session.wantBubble,
  );
  const { chrome } = useChrome();

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

  useEffect(() => {
    syncSessionPhase(session.phase);
  }, [session.phase, syncSessionPhase]);

  useEffect(() => {
    let unAsk: (() => void) | undefined;
    let unFocus: (() => void) | undefined;

    void listen("shell-ask-close", () => {
      setCloseAskOpen(true);
    }).then((fn) => {
      unAsk = fn;
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
    };
  }, []);

  const shellOverlay = chrome.titlebarCompact;

  return (
    <div className={`shell${shellOverlay ? " titlebar-overlay" : ""}`}>
      <ShellTitleBar
        port={session.port}
        conn={session.titleConn}
        chrome={chrome}
        sidebarWidthPx={sidebarWidthPx}
        onOpenSettings={() => openSettings()}
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

      <div className="shell-body">
        {session.showBootPanel && (
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

        {session.showIframe && session.serviceUrl && (
          <iframe
            key={session.iframeKey}
            className="harness-frame"
            title="DeepSeek Harness"
            src={session.serviceUrl}
            allow="clipboard-read; clipboard-write"
            onLoad={session.markIframeConnected}
            onError={session.markIframeError}
          />
        )}

        {bubbleVisible && (
          <ShellProgressBubble
            message={session.bubbleMessage}
            leaving={bubbleLeaving}
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
    </div>
  );
}
