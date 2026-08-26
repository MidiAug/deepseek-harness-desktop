import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveShowFault,
  deriveStealth,
  deriveSurfaceMode,
  INITIAL_BOOT_FAULT,
  INITIAL_BOOT_META,
} from "./bootSurfaceMode.ts";

describe("deriveShowFault", () => {
  it("false when no message", () => {
    assert.equal(deriveShowFault(INITIAL_BOOT_FAULT), false);
  });
  it("true when message set", () => {
    assert.equal(deriveShowFault({ message: "SPAWN_FAILED" }), true);
  });
});

describe("deriveStealth", () => {
  it("true before runtime known", () => {
    assert.equal(deriveStealth(false, { runtimeKnown: false }), true);
  });
  it("true when forceStealth", () => {
    assert.equal(deriveStealth(true, { runtimeKnown: true }), true);
  });
  it("false when known and not forced", () => {
    assert.equal(deriveStealth(false, { runtimeKnown: true }), false);
  });
});

describe("deriveSurfaceMode", () => {
  const base = {
    showFault: false,
    awaitingManualStart: false,
    embedding: false,
    fastPath: false,
    runtimeKnown: true,
  };

  it("install when cold install path", () => {
    assert.equal(deriveSurfaceMode(base), "install");
  });
  it("status when fault", () => {
    assert.equal(deriveSurfaceMode({ ...base, showFault: true }), "status");
  });
  it("status when awaiting manual start", () => {
    assert.equal(
      deriveSurfaceMode({ ...base, awaitingManualStart: true }),
      "status",
    );
  });
  it("status when embedding", () => {
    assert.equal(deriveSurfaceMode({ ...base, embedding: true }), "status");
  });
  it("status when fastPath", () => {
    assert.equal(deriveSurfaceMode({ ...base, fastPath: true }), "status");
  });
  it("status when runtime unknown", () => {
    assert.equal(
      deriveSurfaceMode({ ...base, runtimeKnown: false }),
      "status",
    );
  });
  it("install only when all gates pass", () => {
    assert.equal(
      deriveSurfaceMode({
        showFault: false,
        awaitingManualStart: false,
        embedding: false,
        fastPath: false,
        runtimeKnown: true,
      }),
      "install",
    );
  });
});
