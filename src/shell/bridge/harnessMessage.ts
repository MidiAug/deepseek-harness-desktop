/** harness iframe postMessage 入站校验：origin + source 绑定 */

import { isTrustedInboundMessageOrigin } from "./messageOrigin.ts";

export function isHarnessFrameMessage(
  ev: MessageEvent,
  frame: HTMLIFrameElement | null | undefined,
): frame is HTMLIFrameElement {
  if (!isTrustedInboundMessageOrigin(ev.origin)) return false;
  if (!frame?.contentWindow) return false;
  return ev.source === frame.contentWindow;
}
