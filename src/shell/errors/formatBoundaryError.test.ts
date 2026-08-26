import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatBoundaryError,
  summarizeErrorMessage,
} from "./formatBoundaryError.ts";

describe("summarizeErrorMessage", () => {
  it("returns trimmed single line", () => {
    assert.equal(
      summarizeErrorMessage("  useState is not defined  "),
      "useState is not defined",
    );
  });
  it("truncates very long messages", () => {
    const long = "x".repeat(200);
    const out = summarizeErrorMessage(long);
    assert.ok(out.length <= 160);
    assert.match(out, /…$/);
  });
});

describe("formatBoundaryError", () => {
  it("builds message, stack trace, and full detail", () => {
    const err = new Error("useState is not defined");
    err.stack = "ReferenceError: useState is not defined\n    at App.tsx:1:1";
    const view = formatBoundaryError(err, "\n    in App");
    assert.equal(view.message, "useState is not defined");
    assert.match(view.stackTrace, /App\.tsx/);
    assert.match(view.stackTrace, /React component stack/);
    assert.match(view.fullDetail, /ReferenceError: useState is not defined/);
  });

  it("handles missing stack", () => {
    const err = new Error("boom");
    err.stack = undefined;
    const view = formatBoundaryError(err, null);
    assert.equal(view.message, "boom");
    assert.equal(view.stackTrace, "");
    assert.equal(view.fullDetail, "Error: boom");
  });
});
