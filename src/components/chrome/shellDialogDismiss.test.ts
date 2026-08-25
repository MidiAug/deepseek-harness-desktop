import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** 与 ShellDialogFrame 武装逻辑同构：open 翻转后首帧不可 dismiss */
export function shouldArmBackdropDismiss(opts: {
  open: boolean;
  armed: boolean;
}): boolean {
  return opts.open && opts.armed;
}

describe("shouldArmBackdropDismiss", () => {
  it("closed → never", () => {
    assert.equal(
      shouldArmBackdropDismiss({ open: false, armed: true }),
      false,
    );
  });
  it("just opened → not armed", () => {
    assert.equal(
      shouldArmBackdropDismiss({ open: true, armed: false }),
      false,
    );
  });
  it("open and armed → allow dismiss", () => {
    assert.equal(
      shouldArmBackdropDismiss({ open: true, armed: true }),
      true,
    );
  });
});
