#!/usr/bin/env node
/** Pure selector/fallback helpers mirrored from inject (no DOM). */
import assert from "node:assert/strict";

function closestMock(target, list) {
  for (const sel of list) {
    if (target.matches && target.matches(sel)) return target;
    if (target.closest && target.closest(sel)) return target;
  }
  return null;
}

function closest(target, selectorList) {
  if (!target || !target.closest || !selectorList) return null;
  for (let i = 0; i < selectorList.length; i++) {
    try {
      const el = target.closest(selectorList[i]);
      if (el) return el;
    } catch {
      /* invalid selector in old WebView — skip */
    }
  }
  return null;
}

assert.equal(closest(null, ["a"]), null);
assert.equal(closest({ closest: () => null }, ["a"]), null);

const fakeEl = {
  closest(sel) {
    return sel === "[data-slot='sidebar']" ? { tag: "aside" } : null;
  },
};
assert.deepEqual(
  closest(fakeEl, ["[data-slot='sidebar']", "[data-testid=sidebar]"]),
  { tag: "aside" },
);

console.log("inject selector fallback checks passed.");
