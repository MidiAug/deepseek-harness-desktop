/** ErrorBoundary 展示：错误信息 + 堆栈跟踪 */

export type BoundaryErrorView = {
  /** 一行错误信息（Error.message） */
  message: string;
  /** 堆栈正文（JS stack + React component stack），可为空 */
  stackTrace: string;
  /** 复制用：错误信息 + 完整堆栈 */
  fullDetail: string;
};

/** 从 Error.message 提取一行展示 */
export function summarizeErrorMessage(message: string): string {
  const oneLine = message.replace(/\s+/g, " ").trim();
  if (!oneLine) return "Unknown error";
  const dot = oneLine.indexOf(". ");
  if (dot > 0 && dot < 140) return oneLine.slice(0, dot + 1);
  if (oneLine.length <= 160) return oneLine;
  return `${oneLine.slice(0, 157)}…`;
}

function buildStackTrace(
  error: Error,
  componentStack?: string | null,
): string {
  const parts: string[] = [];
  if (error.stack?.trim()) {
    parts.push(error.stack.trim());
  }
  const react = componentStack?.trim();
  if (react) {
    if (parts.length) parts.push("");
    parts.push("--- React component stack ---", react);
  }
  return parts.join("\n");
}

export function formatBoundaryError(
  error: Error,
  componentStack?: string | null,
): BoundaryErrorView {
  const raw = (error.message || error.name || "Unknown error").trim();
  const message = summarizeErrorMessage(raw);
  const stackTrace = buildStackTrace(error, componentStack);
  const headline = `${error.name}: ${raw}`;
  const fullDetail = stackTrace
    ? `${headline}\n\n${stackTrace}`
    : headline;

  return { message, stackTrace, fullDetail };
}
