import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPathConflictPair,
  pathTailForDisplay,
  shortenPathForDisplay,
  splitPathForDisplay,
} from "./formatPathShort.ts";

describe("shortenPathForDisplay", () => {
  it("abbreviates Windows Roaming", () => {
    assert.equal(
      shortenPathForDisplay(
        "C:\\Users\\alice\\AppData\\Roaming\\com.deepseek.harness.desktop",
      ),
      "%APPDATA%\\com.deepseek.harness.desktop",
    );
  });

  it("abbreviates Windows user profile", () => {
    assert.equal(shortenPathForDisplay("C:\\Users\\alice\\.dsh"), "~\\.dsh");
  });

  it("abbreviates Unix home", () => {
    assert.equal(shortenPathForDisplay("/home/alice/.dsh"), "~/.dsh");
  });
});

describe("formatPathConflictPair", () => {
  it("shows folder names when siblings under same parent", () => {
    assert.deepEqual(
      formatPathConflictPair(
        "C:\\Users\\alice\\AppData\\Roaming\\com.deepseek.harness.desktop",
        "C:\\Users\\alice\\AppData\\Roaming\\com.deepseek.harness.desktop-desktop",
      ),
      {
        from: "com.deepseek.harness.desktop",
        to: "com.deepseek.harness.desktop-desktop",
        context: "%APPDATA%",
      },
    );
  });
});

describe("splitPathForDisplay", () => {
  it("splits env prefix and segments", () => {
    assert.deepEqual(
      splitPathForDisplay(
        "C:\\Users\\alice\\AppData\\Roaming\\com.deepseek.harness.desktop-shell",
      ),
      {
        prefix: "%APPDATA%",
        segments: ["com.deepseek.harness.desktop-shell"],
      },
    );
  });
});

describe("pathTailForDisplay", () => {
  it("joins tail with backslashes only", () => {
    assert.equal(
      pathTailForDisplay(
        "C:\\Users\\alice\\AppData\\Roaming\\com.deepseek.harness.desktop-shell",
      ),
      "com.deepseek.harness.desktop-shell",
    );
  });
});
