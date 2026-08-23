import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  getRecoveryPlan,
  parseHostErrorPrefix,
} from "./recoveryMatrix.ts";

describe("parseHostErrorPrefix", () => {
  test("extracts known prefix before colon", () => {
    assert.equal(parseHostErrorPrefix("INSTALL_FAILED: foo"), "INSTALL_FAILED");
    assert.equal(parseHostErrorPrefix("HEALTH_TIMEOUT: timed out"), "HEALTH_TIMEOUT");
    assert.equal(parseHostErrorPrefix("HARNESS_NOT_FOUND"), "HARNESS_NOT_FOUND");
  });

  test("returns DEFAULT for unknown prefix", () => {
    assert.equal(parseHostErrorPrefix("UNKNOWN: err"), "DEFAULT");
    assert.equal(parseHostErrorPrefix("random message"), "DEFAULT");
  });
});

describe("getRecoveryPlan", () => {
  test("maps INSTALL_FAILED to network primary", () => {
    const plan = getRecoveryPlan("INSTALL_FAILED: download failed");
    assert.equal(plan.prefix, "INSTALL_FAILED");
    assert.equal(plan.primary, "network");
    assert.deepEqual(plan.secondary, ["retry", "logs"]);
  });

  test("maps DEFAULT to retry primary", () => {
    const plan = getRecoveryPlan("something else");
    assert.equal(plan.prefix, "DEFAULT");
    assert.equal(plan.primary, "retry");
  });
});
