import { useCallback, useEffect, useId, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { shellApi, shellLog, useChrome } from "../../shell";
import { useLocale } from "../../shell/locale";
import { useAppToast } from "../../shell/contexts/ShellToastProvider";
import { formatBoundaryError } from "../../shell/errors/formatBoundaryError";
import {
  IconFolderOpenOutline16,
  IconRefreshOutline16,
} from "./DshIcons";
import { ShellTooltip } from "./ShellTooltip";
import { CompactTitleBar } from "../titlebar/CompactTitleBar";
import { MinimalTitleBar } from "../titlebar/MinimalTitleBar";
import type { WinAction } from "../titlebar/titlebarTypes";
import { IconCopyOutline14 } from "./icons/settings";

type Props = {
  error: Error;
  componentStack?: string | null;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyIconButton({
  label,
  onCopy,
}: {
  label: string;
  onCopy: () => void | Promise<void>;
}) {
  return (
    <ShellTooltip label={label}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          void onCopy();
        }}
      >
        <IconCopyOutline14 />
      </button>
    </ShellTooltip>
  );
}

/** 应用异常全页：简洁/经典顶栏（仅窗控）+ 错误信息/堆栈分级 */
export function ShellErrorPage({ error, componentStack }: Props) {
  const { t } = useLocale();
  const { showToast } = useAppToast();
  const { chrome } = useChrome();
  const view = formatBoundaryError(error, componentStack);
  const stackId = useId();
  const hasStack = view.stackTrace.length > 0;
  const [stackOpen, setStackOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const compact = chrome.titlebarCompact;

  useEffect(() => {
    const w = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void w.isMaximized().then((next) => {
      if (!cancelled) setMaximized(next);
    });
    void w.onResized(() => {
      void w.isMaximized().then((next) => {
        if (!cancelled) setMaximized(next);
      });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const onWin = useCallback(async (action: WinAction) => {
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "maximize") {
      await w.toggleMaximize();
      setMaximized(await w.isMaximized());
    } else await w.close();
  }, []);

  const copyMessage = useCallback(async () => {
    const ok = await copyText(view.message);
    if (ok) showToast(t("shell.error.copied"));
    else showToast(t("shell.error.copyFailed"));
  }, [showToast, t, view.message]);

  const copyStack = useCallback(async () => {
    const ok = await copyText(view.stackTrace || view.fullDetail);
    if (ok) showToast(t("shell.error.copied"));
    else showToast(t("shell.error.copyFailed"));
  }, [showToast, t, view.fullDetail, view.stackTrace]);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  const openLogs = useCallback(() => {
    shellLog.op("shell.error.openLogs");
    void shellApi.openKnownPath("logs");
  }, []);

  const noop = useCallback(() => undefined, []);

  return (
    <div className={`shell${compact ? " titlebar-overlay" : ""}`}>
      {compact ? (
        <CompactTitleBar
          sidebarWidthPx={0}
          maximized={maximized}
          chromeLocked
          showSessionLog={false}
          onSessionLog={noop}
          onOpenSettings={noop}
          onRestart={reload}
          onStop={noop}
          onOpenDshHome={noop}
          onOpenLogs={openLogs}
          onHideToTray={() => {
            void shellApi.hideToTray();
          }}
          onAbout={noop}
          onCopyVersion={noop}
          onOpenPlatform={noop}
          onWin={onWin}
        />
      ) : (
        <MinimalTitleBar maximized={maximized} controlsOnly onWin={onWin} />
      )}

      <div className="shell-body shell-body--error">
        <main className="shell-error-surface" role="alert">
          <header className="shell-error-head">
            <div className="shell-error-title-row">
              <h1 className="shell-error-title">{t("shell.error.title")}</h1>
              <div className="shell-error-quick" role="toolbar">
                <ShellTooltip label={t("shell.error.reload")}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("shell.error.reload")}
                    onClick={reload}
                  >
                    <IconRefreshOutline16 size={16} />
                  </button>
                </ShellTooltip>
                <ShellTooltip label={t("shell.error.logs")}>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t("shell.error.logs")}
                    onClick={openLogs}
                  >
                    <IconFolderOpenOutline16 size={16} />
                  </button>
                </ShellTooltip>
              </div>
            </div>
            <p className="shell-error-lead">{t("shell.error.body")}</p>
          </header>

          <section
            className="shell-error-panel"
            aria-label={t("shell.error.messageLabel")}
          >
            <div className="shell-error-field">
              <div className="shell-error-field__head">
                <span className="shell-error-field__label">
                  {t("shell.error.messageLabel")}
                </span>
                <CopyIconButton
                  label={t("shell.error.copyMessage")}
                  onCopy={copyMessage}
                />
              </div>
              <pre className="shell-error-code">{view.message}</pre>
            </div>

            {hasStack ? (
              <div
                className={`shell-error-stack${stackOpen ? " is-open" : ""}`}
              >
                <div className="shell-error-stack__head">
                  <button
                    type="button"
                    className="shell-error-stack__toggle"
                    aria-expanded={stackOpen}
                    aria-controls={stackId}
                    onClick={() => setStackOpen((open) => !open)}
                  >
                    <span className="shell-error-stack__chevron" aria-hidden />
                    {t("shell.error.stackToggle")}
                  </button>
                  <CopyIconButton
                    label={t("shell.error.copyStack")}
                    onCopy={copyStack}
                  />
                </div>
                <div id={stackId} className="shell-error-stack__viewport">
                  <div className="shell-error-stack__inner">
                    <pre className="shell-error-code shell-error-code--stack">
                      {view.stackTrace}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}
