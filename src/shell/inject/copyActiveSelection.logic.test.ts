/**
 * Pure decision logic mirror of iframe `copyActiveSelection` (B48 hotfix).
 * Keeps menu-copy from discarding multi-segment selections when anchor
 * is outside the right-click block.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

type SelSnap = {
  collapsed: boolean;
  text: string;
  anchorInBlock: boolean;
};

function decideCopy(sel: SelSnap | null): {
  hasSelection: boolean;
  shouldPickBlock: boolean;
} {
  const text = sel ? sel.text.trim() : "";
  // Correct: do NOT require anchorInBlock
  const hasSelection = !!(sel && !sel.collapsed && text.length > 0);
  return {
    hasSelection,
    shouldPickBlock: !hasSelection,
  };
}

function decideCopyBuggy(sel: SelSnap | null): {
  hasSelection: boolean;
  shouldPickBlock: boolean;
} {
  const text = sel ? sel.text.trim() : "";
  const hasSelection = !!(
    sel &&
    !sel.collapsed &&
    text.length > 0 &&
    sel.anchorInBlock
  );
  return {
    hasSelection,
    shouldPickBlock: !hasSelection,
  };
}

describe("copyActiveSelection decision", () => {
  it("Ctrl+A multi-segment: keep selection even if anchor outside click block", () => {
    const sel: SelSnap = {
      collapsed: false,
      text: "a".repeat(362),
      anchorInBlock: false,
    };
    const buggy = decideCopyBuggy(sel);
    assert.equal(buggy.shouldPickBlock, true, "old bug would shrink selection");

    const fixed = decideCopy(sel);
    assert.equal(fixed.hasSelection, true);
    assert.equal(fixed.shouldPickBlock, false);
  });

  it("no selection: fall back to block", () => {
    const fixed = decideCopy({
      collapsed: true,
      text: "",
      anchorInBlock: false,
    });
    assert.equal(fixed.hasSelection, false);
    assert.equal(fixed.shouldPickBlock, true);
  });

  it("single-block selection with anchor in block: keep", () => {
    const fixed = decideCopy({
      collapsed: false,
      text: "hello",
      anchorInBlock: true,
    });
    assert.equal(fixed.hasSelection, true);
    assert.equal(fixed.shouldPickBlock, false);
  });

  it("whitespace-only selection: treat as empty → pick block", () => {
    const fixed = decideCopy({
      collapsed: false,
      text: "   \n\t  ",
      anchorInBlock: true,
    });
    assert.equal(fixed.hasSelection, false);
    assert.equal(fixed.shouldPickBlock, true);
  });

  it("native Ctrl+C must defer clear until after browser default copy", () => {
    // Models capture-phase copy listener: sync clear empties selection
    // before the UA writes the clipboard → toast shows len, paste is stale.
    let selectionAlive = true;
    const captureHandler = (clearSync: boolean) => {
      const seenLen = selectionAlive ? 362 : 0;
      if (clearSync) selectionAlive = false;
      else {
        queueMicrotask(() => {
          selectionAlive = false;
        });
      }
      return { toastLen: seenLen, clipboardWouldSee: selectionAlive ? 362 : 0 };
    };

    const bad = captureHandler(true);
    assert.equal(bad.toastLen, 362);
    assert.equal(bad.clipboardWouldSee, 0, "sync clear races default copy");

    selectionAlive = true;
    const good = captureHandler(false);
    assert.equal(good.toastLen, 362);
    assert.equal(good.clipboardWouldSee, 362, "deferred clear keeps selection for UA");
  });
});
