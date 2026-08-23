import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { isLogOnly, mapStage, stageIndex } from "./hostProgressMap.ts";

describe("mapStage", () => {
  test("maps npm-log and install-dsh family", () => {
    assert.equal(mapStage("npm-log"), "install-dsh");
    assert.equal(mapStage("install-dsh"), "install-dsh");
    assert.equal(mapStage("update-dsh-check"), "install-dsh");
  });

  test("maps node download pipeline prefixes", () => {
    assert.equal(mapStage("download-node"), "download-node");
    assert.equal(mapStage("verify-node-sha"), "verify-node");
    assert.equal(mapStage("extract-node"), "extract-node");
  });

  test("maps detect and start families", () => {
    assert.equal(mapStage("check-update"), "detect");
    assert.equal(mapStage("detect"), "detect");
    assert.equal(mapStage("start"), "start");
    assert.equal(mapStage("start-harness"), "start");
  });

  test("returns null for unknown stage", () => {
    assert.equal(mapStage(null), null);
    assert.equal(mapStage("shell-update"), null);
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
