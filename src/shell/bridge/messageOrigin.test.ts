import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isTrustedHarnessOrigin,
  isTrustedShellOrigin,
  isTrustedInboundMessageOrigin,
} from "./messageOrigin.ts";

describe("isTrustedHarnessOrigin", () => {
  it("accepts loopback with port", () => {
    assert.equal(isTrustedHarnessOrigin("http://127.0.0.1:3081"), true);
    assert.equal(isTrustedHarnessOrigin("http://localhost:3081"), true);
  });
  it("rejects arbitrary hosts", () => {
    assert.equal(isTrustedHarnessOrigin("https://evil.com"), false);
    assert.equal(isTrustedHarnessOrigin(""), false);
  });
});

describe("isTrustedShellOrigin", () => {
  it("accepts vite dev", () => {
    assert.equal(isTrustedShellOrigin("http://localhost:1420"), true);
  });
  it("accepts tauri localhost", () => {
    assert.equal(isTrustedShellOrigin("https://tauri.localhost"), true);
  });
});

describe("isTrustedInboundMessageOrigin", () => {
  it("accepts harness loopback", () => {
    assert.equal(isTrustedInboundMessageOrigin("http://127.0.0.1:3081"), true);
  });
});
