import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reportHarnessLifecycleFailure } from "./settingsFaultBoundary.ts";

describe("reportHarnessLifecycleFailure", () => {
  it("clears settings fault and forwards message", () => {
    let cleared = false;
    let forwarded: string | undefined;
    reportHarnessLifecycleFailure(
      () => {
        cleared = true;
      },
      (msg) => {
        forwarded = msg;
      },
      "SPAWN_FAILED: test",
    );
    assert.equal(cleared, true);
    assert.equal(forwarded, "SPAWN_FAILED: test");
  });

  it("clears settings fault even when callback missing", () => {
    let cleared = false;
    reportHarnessLifecycleFailure(
      () => {
        cleared = true;
      },
      undefined,
      "err",
    );
    assert.equal(cleared, true);
  });
});
