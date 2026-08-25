import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { InstallStage } from "../bindings.ts";
import {
  DEPRECATED_STAGE_ALIASES,
  INSTALL_STAGE_TO_BOOT,
  isLogOnly,
  mapStage,
  mapStageCoverage,
  stageIndex,
} from "./hostProgressMap.ts";

describe("mapStage", () => {
  test("maps official InstallStage via table", () => {
    assert.equal(mapStage("npm-log"), "install-dsh");
    assert.equal(mapStage("install-dsh"), "install-dsh");
    assert.equal(mapStage("update-dsh"), "install-dsh");
    assert.equal(mapStage("download-node"), "download-node");
    assert.equal(mapStage("verify-node"), "verify-node");
    assert.equal(mapStage("extract-node"), "extract-node");
    assert.equal(mapStage("detect"), "detect");
    assert.equal(mapStage("start"), "start");
    assert.equal(mapStage("reset"), "detect");
  });

  test("maps deprecated aliases explicitly", () => {
    assert.equal(mapStage("check-update"), "detect");
    assert.equal(mapStage("update-dsh-check"), "install-dsh");
    assert.equal(mapStage("start-harness"), "start");
    assert.equal(mapStage("verify-node-sha"), "verify-node");
  });

  test("returns null for non-boot / unknown (no fuzzy prefix)", () => {
    assert.equal(mapStage(null), null);
    assert.equal(mapStage("shell-update"), null);
    assert.equal(mapStage("ready"), null);
    assert.equal(mapStage("download-node-extra"), null);
    assert.equal(mapStage("start-something-new"), null);
  });
});

describe("F-stage InstallStage coverage", () => {
  test("INSTALL_STAGE_TO_BOOT covers every InstallStage key", () => {
    const keys = Object.keys(INSTALL_STAGE_TO_BOOT) as InstallStage[];
    assert.equal(keys.length, 11);
    for (const wire of keys) {
      assert.equal(
        mapStageCoverage(wire),
        INSTALL_STAGE_TO_BOOT[wire],
        wire,
      );
      assert.equal(mapStage(wire), INSTALL_STAGE_TO_BOOT[wire], wire);
    }
  });

  test("deprecated alias table is non-empty and wired", () => {
    const aliases = Object.keys(DEPRECATED_STAGE_ALIASES);
    assert.ok(aliases.length >= 4);
    for (const a of aliases) {
      assert.equal(mapStage(a), DEPRECATED_STAGE_ALIASES[a]);
    }
  });
});

describe("stageIndex", () => {
  test("orders known boot stages", () => {
    assert.equal(stageIndex("detect"), 0);
    assert.equal(stageIndex("install-dsh"), 4);
    assert.equal(stageIndex("start"), 5);
    assert.equal(stageIndex(null), 0);
  });
});

describe("isLogOnly", () => {
  test("only npm-log is log-only", () => {
    assert.equal(isLogOnly("npm-log"), true);
    assert.equal(isLogOnly("install-dsh"), false);
  });
});
