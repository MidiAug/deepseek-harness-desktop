import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFocusTrapTab } from "./shellDialogFocus.ts";

describe("resolveFocusTrapTab", () => {
  it("wraps forward from last", () => {
    assert.equal(resolveFocusTrapTab(false, 2, 3), "first");
  });

  it("wraps backward from first", () => {
    assert.equal(resolveFocusTrapTab(true, 0, 3), "last");
  });

  it("does not trap in the middle", () => {
    assert.equal(resolveFocusTrapTab(false, 1, 3), null);
    assert.equal(resolveFocusTrapTab(true, 1, 3), null);
  });

  it("focus on panel container jumps into trap", () => {
    assert.equal(resolveFocusTrapTab(false, -1, 2), "first");
    assert.equal(resolveFocusTrapTab(true, -1, 2), "last");
  });

  it("empty list → no action", () => {
    assert.equal(resolveFocusTrapTab(false, 0, 0), null);
  });
});
