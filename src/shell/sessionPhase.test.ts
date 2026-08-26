import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveShowBootPanel, deriveShowIframe } from "./sessionPhase.ts";

describe("deriveShowIframe", () => {
  it("shows during embedding and ready when url present", () => {
    assert.equal(deriveShowIframe("embedding", "http://127.0.0.1:1"), true);
    assert.equal(deriveShowIframe("ready", "http://127.0.0.1:1"), true);
  });

  it("hides without url or during boot phases", () => {
    assert.equal(deriveShowIframe("embedding", null), false);
    assert.equal(deriveShowIframe("spawning", "http://127.0.0.1:1"), false);
    assert.equal(deriveShowIframe("installing", "http://127.0.0.1:1"), false);
  });
});

describe("deriveShowBootPanel", () => {
  it("includes embedding and excludes ready", () => {
    assert.equal(deriveShowBootPanel("embedding"), true);
    assert.equal(deriveShowBootPanel("ready"), false);
    assert.equal(deriveShowBootPanel("failed"), true);
  });
});
