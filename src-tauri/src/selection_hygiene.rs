//! Harness iframe 选择洁净：按 DSH 稳定 `data-slot` / `data-chat-flow-kind` 标 chrome，
//! 不用文案关键词、不用 CSS-module 哈希类。对话正文与工具行保持可复制。
//! 知识库：`dev/knowledge-base/05-dsh-dom-iframe-chrome.md`
//! postMessage：`{ source: "dsh-shell", type: "selection-hygiene", enabled: bool }`

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
  var enabled = false;

  // 稳定 DSH slot / flow 选择器（对照 reference deepseek-harness slots.ts）
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

  function ensureStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!enabled) {
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

  function clearMarks() {
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

  // 用户消息行：气泡可拖选，时间/复制等兄弟节点不可（无独立 data-slot）
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

  function markCodeBlockChrome() {
    var blocks = document.querySelectorAll("[class*='md-code-block']");
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var header = block.firstElementChild;
      if (header && header.querySelector("button")) {
        header.setAttribute("data-dsh-shell-no-select", "1");
      }
    }
  }

  function refresh() {
    try {
      if (!enabled) {
        clearMarks();
        ensureStyle();
        return;
      }
      clearMarks();
      ensureStyle();
      if (document.body) {
        markUserRowChrome();
        markCodeBlockChrome();
      }
    } catch (e) {}
  }

  function setEnabled(next) {
    enabled = !!next;
    refresh();
  }

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type === "selection-hygiene") {
      setEnabled(d.enabled === true);
    }
  });

  function boot() {
    refresh();
    var obs = new MutationObserver(function (mutations) {
      if (!enabled) return;
      var needUserChrome = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === "childList" && m.addedNodes.length > 0) {
          needUserChrome = true;
          break;
        }
      }
      if (needUserChrome) markUserRowChrome();
      if (boot._t) clearTimeout(boot._t);
      boot._t = setTimeout(refresh, 200);
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
"#;
