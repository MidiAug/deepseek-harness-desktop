import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isSidebarAction,
  isTextEditAction,
  pasteViaShellClipboard,
  shouldClearSelectionAfterCopy,
  shouldShowCopyToast,
} from "./policies.ts";

describe("bridge policies", () => {
  it("input: no toast, no clear, paste via shell", () => {
    assert.equal(shouldShowCopyToast("input"), false);
    assert.equal(shouldClearSelectionAfterCopy("input"), false);
    assert.equal(pasteViaShellClipboard("input"), true);
  });

  it("content: toast + clear, paste not via shell", () => {
    assert.equal(shouldShowCopyToast("content"), true);
    assert.equal(shouldClearSelectionAfterCopy("content"), true);
    assert.equal(pasteViaShellClipboard("content"), false);
  });

  it("isTextEditAction", () => {
    assert.equal(isTextEditAction("undo"), true);
    assert.equal(isTextEditAction("rename"), false);
  });

  it("isSidebarAction", () => {
    assert.equal(isSidebarAction("fork"), true);
    assert.equal(isSidebarAction("copy"), false);
  });
});
