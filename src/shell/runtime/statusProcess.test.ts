import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusProcessKind } from "./statusProcess.ts";

describe("statusProcessKind", () => {
  it("running → ready", () => {
    assert.equal(
      statusProcessKind({ processRunning: true, locked: false }),
      "ready",
    );
    assert.equal(
      statusProcessKind({ processRunning: true, locked: true }),
      "ready",
    );
  });

  it("stopped + idle → notRunning（不是未安装）", () => {
    assert.equal(
      statusProcessKind({ processRunning: false, locked: false }),
      "notRunning",
    );
  });

  it("stopped + ops → busy", () => {
    assert.equal(
      statusProcessKind({ processRunning: false, locked: true }),
      "busy",
    );
  });
});
