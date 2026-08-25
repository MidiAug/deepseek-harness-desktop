import type { ReactNode } from "react";
import { useChrome } from "../../shell";

type Props = {
  message: string;
  /** 保留兼容；进度条已移除，不再渲染 */
  working?: boolean;
  awaitingManualStart?: boolean;
  startLabel?: string;
  onStartManual?: () => void;
  /** 失败恢复块等 */
  children?: ReactNode;
};

/** Capability OK / 停止 / 失败 / 探测中：内容区极简状态（金鱼剪影 + 文案），非安装向导。 */
export function SessionStatusSurface({
  message,
  awaitingManualStart = false,
  startLabel,
  onStartManual,
  children,
}: Props) {
  const { resolvedTheme } = useChrome();
  // 深色：白 logo；浅色：黑 logo（无白底方块）
  const logoSrc =
    resolvedTheme === "dark" ? "/ds-logo-white.png" : "/ds-logo-black.png";

  return (
    <main className="session-status-surface">
      <img
        className="session-status-icon"
        src={logoSrc}
        alt=""
        width={96}
        height={96}
        draggable={false}
      />
      {children ? (
        <div className="session-status-body">{children}</div>
      ) : (
        <>
          <p className="session-status-msg" aria-live="polite">
            {message}
          </p>
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
