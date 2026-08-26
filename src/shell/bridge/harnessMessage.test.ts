import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHarnessFrameMessage } from "./harnessMessage.ts";

function fakeMessage(
  origin: string,
  source: MessageEventSource | null,
): MessageEvent {
  return { origin, source } as MessageEvent;
}

describe("isHarnessFrameMessage", () => {
  it("accepts message from harness frame contentWindow", () => {
    const contentWindow = {} as Window;
    const frame = { contentWindow } as HTMLIFrameElement;
    const ev = fakeMessage("http://127.0.0.1:3081", contentWindow);
    assert.equal(isHarnessFrameMessage(ev, frame), true);
  });

  it("rejects loopback origin from wrong source", () => {
    const frame = { contentWindow: {} as Window } as HTMLIFrameElement;
    const ev = fakeMessage("http://127.0.0.1:3081", {} as MessageEventSource);
    assert.equal(isHarnessFrameMessage(ev, frame), false);
  });

  it("rejects untrusted origin even when source matches", () => {
    const contentWindow = {} as Window;
    const frame = { contentWindow } as HTMLIFrameElement;
    const ev = fakeMessage("https://evil.com", contentWindow);
    assert.equal(isHarnessFrameMessage(ev, frame), false);
  });

  it("rejects when frame is null", () => {
    const ev = fakeMessage("http://127.0.0.1:3081", {} as MessageEventSource);
    assert.equal(isHarnessFrameMessage(ev, null), false);
  });
});
