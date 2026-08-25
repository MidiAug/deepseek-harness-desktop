/** 设置状态行：进程态文案（与「入口是否已装」解耦）。 */
export type StatusProcessKind = "ready" | "busy" | "notRunning";

export function statusProcessKind(opts: {
  processRunning: boolean;
  locked: boolean;
}): StatusProcessKind {
  if (opts.processRunning) return "ready";
  if (opts.locked) return "busy";
  return "notRunning";
}
