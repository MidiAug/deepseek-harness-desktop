import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripShellCacheParams } from "./harnessUrl.ts";

describe("stripShellCacheParams", () => {
  it("strips shell cache keys only", () => {
    assert.equal(
      stripShellCacheParams("http://127.0.0.1:3081/?token=abc&t=1&shellCanvas=dark"),
      "http://127.0.0.1:3081/?token=abc",
    );
  });

  it("keeps token when alone", () => {
    assert.equal(
      stripShellCacheParams("http://127.0.0.1:3081/?token=abc"),
      "http://127.0.0.1:3081/?token=abc",
    );
  });

  it("returns bare url when only cache params", () => {
    assert.equal(
      stripShellCacheParams("http://127.0.0.1:3081/?t=9&shellCanvas=light"),
      "http://127.0.0.1:3081/",
    );
  });

  it("no-op without query", () => {
    assert.equal(
      stripShellCacheParams("http://127.0.0.1:3081/"),
      "http://127.0.0.1:3081/",
    );
  });
});
