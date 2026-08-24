import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseFaultDisplay } from "./parseFaultDisplay.ts";

describe("parseFaultDisplay", () => {
  test("prefers harness root cause after blank line", () => {
    const raw =
      'PLUGIN_LOAD_FAILED: dsh exited\n\ncredentials-local: version must be a string';
    const d = parseFaultDisplay(raw);
    assert.equal(d.detail, "credentials-local: version must be a string");
    assert.deepEqual(d.actions, [
      "retry",
      "logs",
      "cleanProfile",
      "resetConfig",
      "reinstallDsh",
    ]);
  });

  test("falls back to host error body without harness tail", () => {
    const d = parseFaultDisplay("PLUGIN_LOAD_FAILED: plugin hang");
    assert.equal(d.detail, "plugin hang");
  });
});
