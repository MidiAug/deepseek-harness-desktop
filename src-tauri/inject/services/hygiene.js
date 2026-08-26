// B49 — selection hygiene service（样式/mark；消息由 feature 注册）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var sel = global.__dshShell.selectors;
  var du = global.__dshShell.services.dom;
  var zoneSvc = global.__dshShell.services.zone;
  var selectionSvc = global.__dshShell.services.selection;

  var STYLE_ID = "dsh-shell-selection-hygiene";
  var HOME_STYLE_ID = "dsh-shell-home-select-lock";
  var PIN_STYLE_ID = "dsh-shell-pin-no-select";
  var HOME_ATTR = "data-dsh-shell-home-select";
  var enabled = false;
  var shellModalOpen = false;

  global.__dshSelectionHygiene = false;
  global.__dshShellModalOpen = false;

  function clearCodeHeaderMarks() {
    var nodes = document.querySelectorAll("[data-dsh-shell-code-header]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute("data-dsh-shell-code-header");
    }
    var pin = document.getElementById(PIN_STYLE_ID);
    if (pin) pin.remove();
  }

  function ensurePinStyle() {
    if (!enabled) return;
    if (document.getElementById(PIN_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = PIN_STYLE_ID;
    style.textContent = [
      "[data-dsh-shell-code-header], [data-dsh-shell-code-header] *",
      "{",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureHomeStyle() {
    if (document.getElementById(HOME_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = HOME_STYLE_ID;
    style.textContent = [
      "html[" + HOME_ATTR + '="1"] , html[' + HOME_ATTR + '="1"] * {',
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}",
      "html[" + HOME_ATTR + '="1"] textarea,',
      "html[" + HOME_ATTR + '="1"] input:not([type]),',
      "html[" + HOME_ATTR + '="1"] input[type="text"],',
      "html[" + HOME_ATTR + '="1"] input[type="search"],',
      "html[" + HOME_ATTR + '="1"] input[type="url"],',
      "html[" + HOME_ATTR + '="1"] input[type="email"],',
      "html[" + HOME_ATTR + '="1"] input[type="password"],',
      "html[" + HOME_ATTR + '="1"] input[type="number"],',
      "html[" + HOME_ATTR + '="1"] [contenteditable="true"],',
      "html[" + HOME_ATTR + '="1"] [contenteditable=""],',
      "html[" + HOME_ATTR + '="1"] [contenteditable="true"] *,',
      "html[" + HOME_ATTR + '="1"] [contenteditable=""] * {',
      "  -webkit-user-select: text !important;",
      "  user-select: text !important;",
      "}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHomeLock() {
    var root = document.documentElement;
    if (root) root.removeAttribute(HOME_ATTR);
    var style = document.getElementById(HOME_STYLE_ID);
    if (style) style.remove();
  }

  function applyHomeLock(on) {
    if (!on) {
      clearHomeLock();
      return;
    }
    ensureHomeStyle();
    if (document.documentElement) {
      document.documentElement.setAttribute(HOME_ATTR, "1");
    }
  }

  function ensureChromeStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!enabled || zoneSvc.isHomeSurface()) {
      if (style) style.remove();
      return;
    }
    if (style) return;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      sel.hygieneNoSelectChrome.join(",\n"),
      "{",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHygieneMarks() {
    var nodes = document.querySelectorAll("[data-dsh-shell-no-select]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute("data-dsh-shell-no-select");
    }
  }

  function markUserRowChrome() {
    var rows = document.querySelectorAll(
      '[data-chat-flow-kind="user"] ' + sel.userHoverRoot,
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      for (var c = 0; c < row.children.length; c++) {
        var child = row.children[c];
        if (zoneSvc.isMessageBubbleContainer(child)) continue;
        child.setAttribute("data-dsh-shell-no-select", "1");
      }
    }
  }

  function markCodeBlockHeaders() {
    if (!enabled) return;
    var blocks = document.querySelectorAll(sel.codeBlock);
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var header = block.firstElementChild;
      if (header && header.querySelector("button")) {
        header.setAttribute("data-dsh-shell-code-header", "1");
      }
    }
  }

  function refresh() {
    try {
      if (!enabled) {
        clearHygieneMarks();
        clearCodeHeaderMarks();
        clearHomeLock();
        ensureChromeStyle();
        return;
      }
      var home = zoneSvc.isHomeSurface();
      applyHomeLock(home);
      if (home) {
        clearHygieneMarks();
        clearCodeHeaderMarks();
        ensureChromeStyle();
        return;
      }
      ensurePinStyle();
      markCodeBlockHeaders();
      clearHygieneMarks();
      ensureChromeStyle();
      if (document.body) markUserRowChrome();
    } catch (e) {}
  }

  function setEnabled(next) {
    enabled = !!next;
    global.__dshSelectionHygiene = enabled;
    refresh();
  }

  function setShellModalOpen(next) {
    shellModalOpen = !!next;
    global.__dshShellModalOpen = shellModalOpen;
    if (shellModalOpen && selectionSvc) selectionSvc.clearSelection();
  }

  function clearSelection() {
    if (selectionSvc) selectionSvc.clearSelection();
  }

  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.hygiene = {
    setEnabled: setEnabled,
    setShellModalOpen: setShellModalOpen,
    clearSelection: clearSelection,
    refresh: refresh,
    isEnabled: function () {
      return enabled;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
