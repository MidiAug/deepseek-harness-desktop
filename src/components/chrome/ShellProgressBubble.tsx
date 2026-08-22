type Props = {
  message: string;
  /** 淡出后由父级卸载 */
  leaving?: boolean;
  /** 进度态显示转圈；短提示（如已复制）为 false */
  showSpinner?: boolean;
};

/** 壳侧顶中进度气泡（对齐 DSH Toast 语汇；不拦截点击） */
export function ShellProgressBubble({
  message,
  leaving = false,
  showSpinner = true,
}: Props) {
  return (
    <div
      className={`shell-progress-bubble${leaving ? " leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {showSpinner && <span className="shell-progress-spinner" aria-hidden />}
      <span className="shell-progress-text">{message}</span>
    </div>
  );
}
