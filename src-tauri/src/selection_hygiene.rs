//! Harness iframe 选择洁净：按 DSH 稳定 `data-slot` / `data-chat-flow-kind` / `data-phase`，
//! 不用文案关键词、不用 CSS-module 哈希类。
//! 首页（hero）：整页禁选，仅可编辑控件解禁；聊天页：chrome 黑名单，正文可复制。
//! 知识库：`dev/knowledge-base/05-dsh-dom-iframe-chrome.md`
//! postMessage：
//!   `{ source: "dsh-shell", type: "selection-hygiene", enabled: bool }`
//!   `{ source: "dsh-shell", type: "shell-modal-open", open: bool }`
//!   `{ source: "dsh-shell", type: "clear-selection" }`

pub const INIT_SCRIPT: &str = r#"
(function () {
  try {
    if (window === window.top) return;
    var host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }

  var STYLE_ID = "dsh-shell-selection-hygiene";
  var HOME_STYLE_ID = "dsh-shell-home-select-lock";
  var PIN_STYLE_ID = "dsh-shell-pin-no-select";
  var HOME_ATTR = "data-dsh-shell-home-select";
  var enabled = false;
  var shellModalOpen = false;
  window.__dshShellModalOpen = false;
  window.__dshSelectionHygiene = false;

  // 聊天/轨迹表面：禁选 chrome（不含整页；首页另走 HOME 锁）
  var CHROME_SELECTORS = [
    '[data-slot="sidebar"], [data-slot="sidebar"] *',
    '[data-slot="conversation.session.header"], [data-slot="conversation.session.header"] *',
    '[data-slot^="conversation.hero."], [data-slot^="conversation.hero."] *',
    '[data-slot="conversation.composer.dock"], [data-slot="conversation.composer.dock"] *',
    '[data-slot="conversation.input.dock"], [data-slot="conversation.input.dock"] *',
    '[data-slot="conversation.input.left"], [data-slot="conversation.input.left"] *',
    '[data-slot="conversation.input.model"], [data-slot="conversation.input.model"] *',
    '[data-slot="conversation.input.plan"], [data-slot="conversation.input.plan"] *',
    '[data-slot="conversation.input.right"], [data-slot="conversation.input.right"] *',
    '[data-slot="conversation.input.attachments"], [data-slot="conversation.input.attachments"] *',
    '[data-slot="conversation.input.overlay"], [data-slot="conversation.input.overlay"] *',
    '[data-slot="conversation.composer.bar"] button',
    '[data-slot="conversation.composer.bar"] [role="combobox"]',
    '[data-slot="conversation.composer.bar"] [role="listbox"]',
    '[data-slot="conversation.composer.bar"] [role="menu"]',
    '[data-chat-flow-kind="turn-tail"], [data-chat-flow-kind="turn-tail"] *',
    '[data-turn-tail], [data-turn-tail] *',
    '[data-slot="conversation.chat.turnTail"], [data-slot="conversation.chat.turnTail"] *',
    '[data-slot="conversation.chat.assistant-actions"], [data-slot="conversation.chat.assistant-actions"] *',
    '[role="tooltip"], [role="tooltip"] *',
    '[data-dsh-shell-no-select], [data-dsh-shell-no-select] *'
  ].join(",\n");

  function isHomeSurface() {
    if (document.querySelector('[data-phase="hero"]')) return true;
    if (document.querySelector('[data-slot^="conversation.hero."]')) return true;
    return false;
  }

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
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureHomeStyle() {
    if (document.getElementById(HOME_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = HOME_STYLE_ID;
    // 首页：整文档禁选；仅可编辑控件解禁（避免黑名单漏网碎蓝块）
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
      "}"
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
    if (!enabled || isHomeSurface()) {
      if (style) style.remove();
      return;
    }
    if (style) return;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      CHROME_SELECTORS,
      "{",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearHygieneMarks() {
    var nodes = document.querySelectorAll("[data-dsh-shell-no-select]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute("data-dsh-shell-no-select");
    }
  }

  function isEditableContext(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      "textarea, input, [contenteditable='true'], [contenteditable='']"
    );
  }

  function clearSelection() {
    try {
      var sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    } catch (e) {}
  }

  function isMessageBubbleContainer(el) {
    if (!el || isEditableContext(el)) return false;
    if (el.querySelector('[data-slot="conversation.message.images"]')) return true;
    if (el.querySelector("p, pre, blockquote, h1, h2, h3, h4, li, table")) return true;
    if (el.querySelector("textarea, input, [contenteditable]")) return true;
    if (el.querySelector("button, [role='button']")) return false;
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > 0;
  }

  function markUserRowChrome() {
    var rows = document.querySelectorAll(
      '[data-chat-flow-kind="user"] [data-time-hover-root]'
    );
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      for (var c = 0; c < row.children.length; c++) {
        var child = row.children[c];
        if (isMessageBubbleContainer(child)) continue;
        child.setAttribute("data-dsh-shell-no-select", "1");
      }
    }
  }

  function markCodeBlockHeaders() {
    if (!enabled) return;
    var blocks = document.querySelectorAll("[class*='md-code-block']");
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
      var home = isHomeSurface();
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
    window.__dshSelectionHygiene = enabled;
    refresh();
  }

  function setShellModalOpen(next) {
    shellModalOpen = !!next;
    window.__dshShellModalOpen = shellModalOpen;
    if (shellModalOpen) clearSelection();
  }

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type === "selection-hygiene") {
      setEnabled(d.enabled === true);
    } else if (d.type === "shell-modal-open") {
      setShellModalOpen(d.open === true);
    } else if (d.type === "clear-selection") {
      clearSelection();
    }
  });

  function boot() {
    refresh();
    var obs = new MutationObserver(function () {
      if (boot._t) clearTimeout(boot._t);
      boot._t = setTimeout(refresh, 200);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
"#;
