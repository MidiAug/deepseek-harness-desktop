import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultShellSettings,
  normalizeRuntimeSource,
  normalizeShellSettings,
  runtimeFromSettings,
} from "./settings.ts";
import { resolveInstallMode } from "./runtime/installMode.ts";

describe("normalizeRuntimeSource", () => {
  it("accepts system/hosted", () => {
    assert.equal(normalizeRuntimeSource("system"), "system");
    assert.equal(normalizeRuntimeSource("hosted"), "hosted");
  });

  it("maps legacy auto to hosted", () => {
    assert.equal(normalizeRuntimeSource("auto"), "hosted");
    assert.equal(normalizeRuntimeSource("bogus"), "hosted");
    assert.equal(normalizeRuntimeSource(undefined), "hosted");
  });
});

describe("normalizeShellSettings runtimeSource", () => {
  it("defaults to hosted", () => {
    assert.equal(normalizeShellSettings(null).runtimeSource, "hosted");
    assert.equal(defaultShellSettings.runtimeSource, "hosted");
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

describe("resolveInstallMode", () => {
  it("prefers explicit runtimeSource", () => {
    assert.equal(
      resolveInstallMode({ runtimeSource: "system", activeRuntime: "hosted" }),
      "system",
    );
  });

  it("falls back to activeRuntime", () => {
    assert.equal(
      resolveInstallMode({ runtimeSource: "auto", activeRuntime: "system" }),
      "system",
    );
  });
});
