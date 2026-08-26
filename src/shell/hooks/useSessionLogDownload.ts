import { useCallback, useEffect, useRef, type RefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { shellApi, shellLog, useAppToast } from "../index";
import type { DownloadFinishedPayload } from "../api/shellApi";
import { dismissSessionExportDialog } from "../harnessFramePost";
import { postSessionLogClick } from "../harnessFrameBridge";
import { useLocale } from "../locale";

/** 简洁顶栏 Session log：代理点击 + 下载完成 toast */
export function useSessionLogDownload(
  harnessFrameRef: RefObject<HTMLIFrameElement | null>,
) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const sessionLogDownloadPending = useRef(false);
  const sessionLogDownloadTimer = useRef<number | null>(null);

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
  }, [harnessFrameRef, showToast, t]);

  const onSessionLog = useCallback(() => {
    shellLog.op("titlebar.sessionLog.download");
    sessionLogDownloadPending.current = true;
    if (sessionLogDownloadTimer.current != null) {
      window.clearTimeout(sessionLogDownloadTimer.current);
    }
    sessionLogDownloadTimer.current = window.setTimeout(() => {
      sessionLogDownloadPending.current = false;
      sessionLogDownloadTimer.current = null;
    }, 60_000);
    postSessionLogClick(harnessFrameRef.current);
  }, [harnessFrameRef]);

  const resetSessionLogPending = useCallback(() => {
    sessionLogDownloadPending.current = false;
    if (sessionLogDownloadTimer.current != null) {
      window.clearTimeout(sessionLogDownloadTimer.current);
      sessionLogDownloadTimer.current = null;
    }
  }, []);

  return { onSessionLog, resetSessionLogPending };
}
