import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planDesktopDispatch } from "./routing.ts";
import type { MenuOpenContext } from "./types.ts";

describe("planDesktopDispatch", () => {
  it("null menu → noop", () => {
    assert.deepEqual(planDesktopDispatch("copy", null), { route: "noop" });
  });

  it("shell input paste reads clipboard", () => {
    const el = {} as HTMLElement;
    assert.deepEqual(planDesktopDispatch("paste", { zone: "input", shellTarget: el }), {
      route: "shell-input",
      action: "paste",
      readClipboard: true,
    });
  });

  it("shell input copy does not read clipboard", () => {
    const el = {} as HTMLElement;
    assert.deepEqual(planDesktopDispatch("copy", { zone: "input", shellTarget: el }), {
      route: "shell-input",
      action: "copy",
      readClipboard: false,
    });
  });

  it("iframe input copy with selectedText → shell-copy (no toast path)", () => {
    assert.deepEqual(
      planDesktopDispatch("copy", {
        zone: "input",
        selectedText: "hello",
      }),
      { route: "shell-copy", zone: "input", text: "hello" },
    );
  });

  it("iframe content copy with selectedText → shell-copy", () => {
    assert.deepEqual(
      planDesktopDispatch("copy", {
        zone: "content",
        selectedText: "block",
      }),
      { route: "shell-copy", zone: "content", text: "block" },
    );
  });

  it("iframe input paste → desktop-action with clipboard read", () => {
    assert.deepEqual(planDesktopDispatch("paste", { zone: "input" }), {
      route: "iframe-desktop",
      action: "paste",
      readClipboard: true,
    });
  });

  it("iframe input undo → desktop-action", () => {
    assert.deepEqual(planDesktopDispatch("undo", { zone: "input" }), {
      route: "iframe-desktop",
      action: "undo",
      readClipboard: false,
    });
  });

  it("iframe input selectAll → desktop-action", () => {
    assert.deepEqual(planDesktopDispatch("selectAll", { zone: "input" }), {
      route: "iframe-desktop",
      action: "selectAll",
      readClipboard: false,
    });
  });

  it("content selectAll → legacy (no selectedText copy path)", () => {
    assert.deepEqual(planDesktopDispatch("selectAll", { zone: "content" }), {
      route: "iframe-legacy",
      action: "selectAll",
    });
  });

  it("sidebar rename → legacy", () => {
    assert.deepEqual(planDesktopDispatch("rename", { zone: "session" }), {
      route: "iframe-legacy",
      action: "rename",
    });
  });

  it("content copy without selectedText → legacy fallback", () => {
    assert.deepEqual(planDesktopDispatch("copy", { zone: "content" }), {
      route: "iframe-legacy",
      action: "copy",
    });
  });

  it("non-text action on shell input → noop", () => {
    const el = {} as HTMLElement;
    assert.deepEqual(planDesktopDispatch("rename", { zone: "input", shellTarget: el }), {
      route: "noop",
    });
  });
});
