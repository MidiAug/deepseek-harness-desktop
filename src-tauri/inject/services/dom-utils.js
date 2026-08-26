// B49 — DOM 小工具（无业务状态）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var dom = global.__dshShell.dom;
  var sel = global.__dshShell.selectors;

  function hasText(el) {
    return !!(el && (el.textContent || "").replace(/\s+/g, "").length);
  }

  function labelMatches(text, candidates) {
    var t = (text || "").replace(/\s+/g, " ").trim();
    for (var i = 0; i < candidates.length; i++) {
      if (t === candidates[i] || t.indexOf(candidates[i]) >= 0) return true;
    }
    return false;
  }

  function isEditableContext(el) {
    if (!el || !el.closest) return false;
    return !!dom.closest(el, sel.editableCandidates);
  }

  function isTextInput(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (tag !== "input") return false;
    var type = (el.getAttribute("type") || "text").toLowerCase();
    return (
      type === "text" ||
      type === "search" ||
      type === "url" ||
      type === "email" ||
      type === "password" ||
      type === "number" ||
      type === ""
    );
  }

  global.__dshShell = global.__dshShell || {};
  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.dom = {
    hasText: hasText,
    labelMatches: labelMatches,
    isEditableContext: isEditableContext,
    isTextInput: isTextInput,
  };
})(typeof window !== "undefined" ? window : globalThis);
