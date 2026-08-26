import { useEffect, useRef, type ReactNode } from "react";
import { shellLog, useChrome } from "../../shell";

type Props = {
  message: string;
  /** 次要说明（如「首次通常需数分钟」） */
  detail?: string | null;
  /** 保留兼容；为 true 时在 logo 下显示转圈 */
  working?: boolean;
  awaitingManualStart?: boolean;
  startLabel?: string;
  onStartManual?: () => void;
  /** 失败恢复块等 */
  children?: ReactNode;
  /** 诊断：谁触发了本状态面（stopped / probe / fault …） */
  surfaceReason?: string;
};

/** Capability OK / 停止 / 失败 / 探测中：内容区极简状态（金鱼剪影 + 文案），非安装向导。 */
export function SessionStatusSurface({
  message,
  detail = null,
  awaitingManualStart = false,
  startLabel,
  onStartManual,
  children,
  working = false,
  surfaceReason = "unknown",
}: Props) {
  const { resolvedTheme } = useChrome();
  const imgRef = useRef<HTMLImageElement>(null);
  const mountRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : `m${Date.now()}`,
  );
  // 深色：白 logo；浅色：黑 logo（无白底方块）
  const logoSrc =
    resolvedTheme === "dark" ? "/ds-logo-white.png" : "/ds-logo-black.png";

  useEffect(() => {
    shellLog.info("boot", "status_surface mount", {
      mount: mountRef.current,
      reason: surfaceReason,
      awaitingManualStart,
      working,
      theme: resolvedTheme,
      logo: logoSrc,
      origin: location.origin,
    });
    return () => {
      shellLog.debug("boot", "status_surface unmount", {
        mount: mountRef.current,
        reason: surfaceReason,
      });
    };
  }, [
    surfaceReason,
    awaitingManualStart,
    working,
    resolvedTheme,
    logoSrc,
  ]);

  function onLogoLoad() {
    const img = imgRef.current;
    shellLog.info("boot", "status_logo load ok", {
      mount: mountRef.current,
      reason: surfaceReason,
      src: img?.currentSrc ?? logoSrc,
      w: img?.naturalWidth ?? 0,
      h: img?.naturalHeight ?? 0,
    });
  }

  function onLogoError() {
    const img = imgRef.current;
    shellLog.warn("boot", "status_logo load fail", {
      mount: mountRef.current,
      reason: surfaceReason,
      src: img?.currentSrc ?? logoSrc,
      complete: img?.complete ?? false,
      origin: location.origin,
      href: location.href,
    });
    void (async () => {
      try {
        const res = await fetch(logoSrc, { cache: "no-store" });
        shellLog.warn("boot", "status_logo fetch probe", {
          mount: mountRef.current,
          status: res.status,
          ok: res.ok,
          type: res.type,
          size: res.headers.get("content-length") ?? "",
        });
      } catch (e) {
        shellLog.error("boot", "status_logo fetch probe err", e, {
          mount: mountRef.current,
          logo: logoSrc,
          origin: location.origin,
        });
      }
    })();
  }

  return (
    <main className="session-status-surface">
      <div className="session-status-visual">
        <img
          ref={imgRef}
          className="session-status-icon"
          src={logoSrc}
          alt=""
          width={96}
          height={96}
          draggable={false}
          onLoad={onLogoLoad}
          onError={onLogoError}
        />
        {working && (
          <span className="session-status-spinner" aria-hidden />
        )}
      </div>
      {children ? (
        <div className="session-status-body">{children}</div>
      ) : (
        <>
          <p className="session-status-msg" aria-live="polite">
            {message}
          </p>
          {detail && (
            <p className="session-status-detail">{detail}</p>
          )}
          {awaitingManualStart && onStartManual && startLabel && (
            <button type="button" className="btn" onClick={onStartManual}>
              {startLabel}
            </button>
          )}
        </>
      )}
    </main>
  );
}
