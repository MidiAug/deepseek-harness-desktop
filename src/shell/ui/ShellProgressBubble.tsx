type Props = {
  message: string;
  /** 淡出后由父级卸载 */
  leaving?: boolean;
  /** 进度态显示转圈；短提示（如已复制）为 false */
  showSpinner?: boolean;
  /** 可选操作（如下载完成后的「打开」） */
  action?: {
    label: string;
    onClick: () => void;
  };
};

/** 壳侧顶中进度气泡（对齐 DSH Toast 语汇；不拦截点击） */
export function ShellProgressBubble({
  message,
  leaving = false,
  showSpinner = true,
  action,
}: Props) {
  return (
    <div
      className={`shell-progress-bubble${leaving ? " leaving" : ""}${action ? " shell-progress-bubble--interactive" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {showSpinner && <span className="shell-progress-spinner" aria-hidden />}
      <span className="shell-progress-text">{message}</span>
      {action && (
        <button
          type="button"
          className="shell-progress-action"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
