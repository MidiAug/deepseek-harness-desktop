//! Harness iframe：全局禁用原生右键；白名单 → 壳顶层菜单（侧栏行 / 文本输入 / 聊天正文块）。
//! 消息：`{ source: "dsh-shell-context-menu", type: "open", zone, x, y }`
//! 回灌：`{ source: "dsh-shell", type: "context-menu-action", action }`

pub const INIT_SCRIPT: &str = r#"
(function () {
  try {
    if (window === window.top) return;
    var host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }

  var MSG_SOURCE = "dsh-shell-context-menu";
  var lastContext = null;
  var suppressCopyToast = false;

  function findEllipsisButton(row) {
    if (!row) return null;
    var buttons = row.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var popup = btn.getAttribute("aria-haspopup");
      if (popup === "menu" || popup === "true") return btn;
    }
    for (var j = 0; j < buttons.length; j++) {
      var label = buttons[j].getAttribute("aria-label") || "";
      if (
        label.indexOf("的操作") >= 0 ||
        /actions?\s+for/i.test(label)
      ) {
        return buttons[j];
      }
    }
    if (buttons.length === 1) return buttons[0];
    if (buttons.length > 1) return buttons[buttons.length - 1];
    return null;
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

  function resolveInput(target) {
    if (!target || !target.closest) return null;
    var editable = target.closest(
      "textarea, input, [contenteditable='true']"
    );
    if (!editable) return null;
    if (
      editable.tagName.toLowerCase() === "input" &&
      !isTextInput(editable)
    ) {
      return null;
    }
    return { zone: "input", editable: editable };
  }

  function resolveSidebar(target) {
    if (!target || !target.closest) return null;
    var sidebar = target.closest('[data-slot="sidebar"]');
    if (!sidebar) return null;

    var treeitem = target.closest('[role="treeitem"]');
    if (!treeitem) return null;

    var expanded = treeitem.getAttribute("aria-expanded");
    if (expanded !== null) {
      if (!findEllipsisButton(treeitem)) return null;
      return { zone: "workspace", row: treeitem };
    }

    if (treeitem.getAttribute("aria-selected") !== null) {
      if (!findEllipsisButton(treeitem)) return null;
      return { zone: "session", row: treeitem };
    }

    return null;
  }

  function isDisclosureTarget(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      "[data-disclosure-row], [data-variant], [data-tool], [class*='thinkBody']"
    );
  }

  function isContentChrome(el) {
    if (!el || !el.closest) return true;
    if (el.closest('[data-slot="sidebar"]')) return true;
    if (el.closest('[data-slot="conversation.session.header"]')) return true;
    if (el.closest('[data-slot="conversation.composer.bar"]')) return true;
    if (el.closest('[data-slot="conversation.composer.dock"]')) return true;
    if (el.closest('[data-slot^="conversation.input."]')) return true;
    if (el.closest('[data-chat-flow-kind="turn-tail"]')) return true;
    if (el.closest('[data-slot="conversation.chat.turnTail"]')) return true;
    if (el.closest('[data-slot="conversation.chat.assistant-actions"]')) {
      return true;
    }
    if (el.closest("button, [role='menu'], [role='menuitem']")) return true;
    if (el.closest("[role='button']")) {
      if (isDisclosureTarget(el)) return false;
      return true;
    }
    return false;
  }

  function isMessageBubbleContainer(el) {
    if (!el || isTextInput(el)) return false;
    if (el.querySelector('[data-slot="conversation.message.images"]')) return true;
    if (el.querySelector("p, pre, blockquote, h1, h2, h3, h4, li, table")) {
      return true;
    }
    if (el.querySelector("textarea, input, [contenteditable]")) return true;
    if (el.querySelector("button, [role='button']")) return false;
    var text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return text.length > 0;
  }

  function resolveUserBubble(target, userRow) {
    var hoverRoot = userRow.querySelector('[data-time-hover-root]');
    if (!hoverRoot) return userRow;
    for (var c = 0; c < hoverRoot.children.length; c++) {
      var child = hoverRoot.children[c];
      if (child.contains(target) && isMessageBubbleContainer(child)) {
        return child;
      }
    }
    return userRow;
  }

  function isInChatArea(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[data-slot="sidebar"]')) return false;
    if (el.closest('[data-slot="conversation.composer.bar"]')) return false;
    if (el.closest('[data-slot^="conversation.input."]')) return false;
    return !!(
      el.closest('[data-chat-flow-kind="user"]') ||
      el.closest('[data-chat-flow-kind="assistant-step"]') ||
      el.closest('[data-chat-flow-kind="tool-call"]') ||
      el.closest('[data-chat-flow-kind="context"]') ||
      el.closest('[data-chat-flow-kind="command"]') ||
      el.closest("[data-disclosure-row]") ||
      el.closest("[data-variant]") ||
      el.closest("[data-tool]") ||
      el.closest('[data-slot="conversation.chat.commandview"]') ||
      el.closest('[data-slot="tool.call.toolview"]') ||
      el.closest('[class*="thinkBody"]') ||
      el.closest('[class*="toolview"]') ||
      el.closest('[class*="toolView"]') ||
      el.closest('[class*="toolBody"]') ||
      el.closest('[class*="tool-body"]')
    );
  }

  function resolveDisclosurePanel(target) {
    var row = target.closest("[data-disclosure-row]");
    if (!row) return null;

    var body = target.closest('[class*="thinkBody"]');
    if (body) return body;

    if (row.getAttribute("aria-expanded") === "true") {
      var sibling = row.nextElementSibling;
      if (sibling) return sibling;
    }

    var panel = row.closest("[data-variant], [data-tool]");
    if (panel) return panel;

    var cmd = row.closest('[data-slot="conversation.chat.commandview"]');
    if (cmd) return cmd;

    return row.parentElement || row;
  }

  function resolveCopyablePanel(target) {
    if (!target || !target.closest || isContentChrome(target)) return null;

    var disclosure = resolveDisclosurePanel(target);
    if (disclosure && isInChatArea(disclosure)) return disclosure;

    var thinkBody = target.closest('[class*="thinkBody"]');
    if (thinkBody && isInChatArea(thinkBody)) return thinkBody;

    var toolview = target.closest('[data-slot="tool.call.toolview"]');
    if (toolview) return toolview;

    var toolPanel = target.closest(
      '[class*="toolview"], [class*="toolView"], [class*="toolBody"], [class*="tool-body"]'
    );
    if (toolPanel && isInChatArea(toolPanel)) return toolPanel;

    return null;
  }

  function resolveNearestSegment(target) {
    if (!target || !target.closest) return null;
    var selectors = [
      "[class*='md-code-block']",
      "pre",
      "blockquote",
      "table",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var seg = target.closest(selectors[i]);
      if (!seg || isContentChrome(seg)) continue;
      if (isInChatArea(seg)) return seg;
    }
    return null;
  }

  function resolveContentBlock(target) {
    if (!target || !target.closest) return null;
    if (isContentChrome(target)) return null;

    var hero = target.closest('[data-slot^="conversation.hero."]');
    if (hero) return { zone: "content", block: hero };

    var panel = resolveCopyablePanel(target);
    if (panel) return { zone: "content", block: panel };

    var segment = resolveNearestSegment(target);
    if (segment) return { zone: "content", block: segment };

    var userRow = target.closest('[data-chat-flow-kind="user"]');
    if (userRow) {
      return {
        zone: "content",
        block: resolveUserBubble(target, userRow)
      };
    }

    return null;
  }

  function resolveZone(target) {
    var input = resolveInput(target);
    if (input) return input;
    var sidebar = resolveSidebar(target);
    if (sidebar) return sidebar;
    return resolveContentBlock(target);
  }

  function labelMatches(text, candidates) {
    var t = (text || "").replace(/\s+/g, " ").trim();
    for (var i = 0; i < candidates.length; i++) {
      if (t === candidates[i] || t.indexOf(candidates[i]) >= 0) return true;
    }
    return false;
  }

  var ACTION_LABELS = {
    rename: ["重命名", "Rename"],
    fork: ["分叉会话", "Fork conversation", "Fork"],
    archive: ["归档会话", "Archive conversation", "Archive"],
    delete: ["删除工作区", "Delete workspace", "Delete"]
  };

  function clickMenuItem(action) {
    var labels = ACTION_LABELS[action];
    if (!labels) return false;
    var menus = document.querySelectorAll('[role="menu"]');
    var menu = menus.length ? menus[menus.length - 1] : null;
    if (!menu) return false;
    var items = menu.querySelectorAll('[role="menuitem"]');
    for (var i = 0; i < items.length; i++) {
      if (labelMatches(items[i].textContent, labels)) {
        items[i].click();
        return true;
      }
    }
    return false;
  }

  function proxySidebarAction(row, action) {
    var ellipsis = findEllipsisButton(row);
    if (!ellipsis) return;
    ellipsis.click();
    var tries = 0;
    function attempt() {
      if (clickMenuItem(action)) return;
      tries += 1;
      if (tries < 8) setTimeout(attempt, 40);
    }
    setTimeout(attempt, 0);
  }

  function clearSelection() {
    var sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  function clearEditableSelection(editable) {
    if (!editable) return;
    var tag = editable.tagName && editable.tagName.toLowerCase();
    if (tag === "textarea" || tag === "input") {
      var pos = editable.selectionStart;
      if (pos != null) editable.setSelectionRange(pos, pos);
    }
  }

  function notifyCopied() {
    try {
      window.parent.postMessage(
        { source: MSG_SOURCE, type: "copied" },
        "*"
      );
    } catch (e) {}
  }

  function execCopy() {
    suppressCopyToast = true;
    try {
      document.execCommand("copy");
    } catch (e) {}
    suppressCopyToast = false;
  }

  function focusDocument() {
    try {
      window.focus();
      if (document.body && document.body.focus) {
        document.body.focus({ preventScroll: true });
      }
    } catch (e) {}
  }

  function runTextAction(editable, action) {
    if (!editable) return;
    try {
      editable.focus();
      if (action === "copy") {
        suppressCopyToast = true;
        document.execCommand("copy");
        suppressCopyToast = false;
        clearSelection();
        clearEditableSelection(editable);
        notifyCopied();
        return;
      }
      document.execCommand(action);
    } catch (e) {}
  }

  function resolveCodeCopyTarget(block) {
    if (!block) return block;
    var el = block;
    var cls = el.className ? String(el.className) : "";
    if (cls.indexOf("md-code-block") < 0) {
      var wrap = el.closest && el.closest("[class*='md-code-block']");
      if (!wrap) return block;
      el = wrap;
    }
    var pre = el.querySelector("pre");
    if (pre) return pre;
    var kids = el.children;
    if (kids.length >= 2 && kids[0].querySelector("button")) {
      return kids[1];
    }
    return el;
  }

  function selectBlockText(block) {
    if (!block) return;
    var target = resolveCodeCopyTarget(block);
    var sel = window.getSelection();
    if (!sel) return;
    var range = document.createRange();
    range.selectNodeContents(target);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function runContentAction(ctx, action) {
    try {
      if (action === "selectAll") {
        focusDocument();
        requestAnimationFrame(function () {
          focusDocument();
          document.execCommand("selectAll");
        });
        return;
      }
      var block = ctx && ctx.block;
      if (!block) return;
      if (action === "copy") {
        var sel = window.getSelection();
        var copyTarget = resolveCodeCopyTarget(block) || block;
        var hasSelection =
          sel &&
          !sel.isCollapsed &&
          (sel.toString() || "").trim().length > 0 &&
          copyTarget.contains(sel.anchorNode);
        if (!hasSelection) selectBlockText(block);
        execCopy();
        clearSelection();
        notifyCopied();
      }
    } catch (e) {}
  }

  document.addEventListener(
    "copy",
    function () {
      if (suppressCopyToast) return;
      try {
        var sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        if (!(sel.toString() || "").trim()) return;
        notifyCopied();
      } catch (e) {}
    },
    true
  );

  document.addEventListener(
    "mousedown",
    function () {
      try {
        window.parent.postMessage(
          { source: MSG_SOURCE, type: "close" },
          "*"
        );
      } catch (e) {}
    },
    true
  );

  document.addEventListener(
    "contextmenu",
    function (ev) {
      try {
        ev.preventDefault();
        ev.stopPropagation();
        var ctx = resolveZone(ev.target);
        if (!ctx) {
          lastContext = null;
          return;
        }
        lastContext = ctx;
        window.parent.postMessage(
          {
            source: MSG_SOURCE,
            type: "open",
            zone: ctx.zone,
            x: ev.clientX,
            y: ev.clientY
          },
          "*"
        );
      } catch (e) {}
    },
    true
  );

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type !== "context-menu-action") return;
    if (!lastContext) return;
    try {
      if (lastContext.zone === "input") {
        runTextAction(lastContext.editable, d.action);
      } else if (lastContext.zone === "content") {
        runContentAction(lastContext, d.action);
      } else if (lastContext.row) {
        proxySidebarAction(lastContext.row, d.action);
      }
    } catch (e) {}
    lastContext = null;
  });
})();
"#;
