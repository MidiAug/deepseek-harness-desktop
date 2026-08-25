import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { RecoveryActionId } from "./useHarnessRecoveryActions.ts";

describe("RecoveryActionId", () => {
  it("includes three recovery actions", () => {
    const ids: RecoveryActionId[] = [
      "cleanProfile",
      "resetConfig",
      "reinstallDsh",
    ];
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
  });
});
