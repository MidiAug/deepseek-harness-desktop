import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultShellSettings,
  normalizeRuntimeSource,
  normalizeShellSettings,
  runtimeFromSettings,
} from "./settings.ts";

describe("normalizeRuntimeSource", () => {
  it("accepts auto/system/hosted", () => {
    assert.equal(normalizeRuntimeSource("auto"), "auto");
    assert.equal(normalizeRuntimeSource("system"), "system");
    assert.equal(normalizeRuntimeSource("hosted"), "hosted");
  });

  it("defaults unknown to auto", () => {
    assert.equal(normalizeRuntimeSource("bogus"), "auto");
    assert.equal(normalizeRuntimeSource(undefined), "auto");
  });
});

describe("normalizeShellSettings runtimeSource", () => {
  it("defaults to auto", () => {
    assert.equal(normalizeShellSettings(null).runtimeSource, "auto");
    assert.equal(defaultShellSettings.runtimeSource, "auto");
  });

  it("roundtrips through runtimeFromSettings", () => {
    const s = normalizeShellSettings({ runtimeSource: "system" });
    assert.equal(runtimeFromSettings(s).runtimeSource, "system");
  });

  it("defaults onboardingDone to false", () => {
    assert.equal(defaultShellSettings.onboardingDone, false);
    assert.equal(normalizeShellSettings(null).onboardingDone, false);
  });
});
