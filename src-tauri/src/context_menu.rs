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
  var selectionHygieneEnabled = false;
  window.__dshSelectionHygiene = false;

  function setSelectionHygieneOn(next) {
    selectionHygieneEnabled = !!next;
    window.__dshSelectionHygiene = selectionHygieneEnabled;
  }

  function isSelectionHygieneOn() {
    return selectionHygieneEnabled === true;
  }

  function runNativeSelectAll() {
    try {
      document.execCommand("selectAll");
    } catch (e) {}
  }

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

  function isTrajectoryViewActive() {
    var scroll = document.querySelector("[data-trajectory-scroll]");
    if (scroll && scroll.offsetParent !== null) return true;
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on =
        tab.getAttribute("aria-selected") === "true" ||
        tab.getAttribute("data-state") === "active";
      if (!on) continue;
      var label = (tab.textContent || "").replace(/\s+/g, " ").trim();
      if (label === "轨迹" || /trajectory/i.test(label) || /trace/i.test(label)) {
        return true;
      }
    }
    return false;
  }

  function isInTrajectoryArea(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      "[data-trajectory-scroll], tr[data-trajectory-row-key]"
    );
  }

  function isTrajectoryDataRow(row) {
    if (!row || row.getAttribute("data-trajectory-row-key") == null) return false;
    if (row.hasAttribute("data-history-load")) return false;
    if (!hasText(row)) return false;
    return row.offsetParent !== null;
  }

  function resolveTrajectoryRow(target) {
    if (!target || !target.closest) return null;
    if (!isTrajectoryViewActive() && !target.closest("[data-trajectory-scroll]")) {
      return null;
    }
    if (isContentChrome(target)) return null;
    var row = target.closest("tr[data-trajectory-row-key]");
    if (!row || !isTrajectoryDataRow(row)) return null;
    return { zone: "content", block: row, trajectory: true };
  }

  function resolveZone(target) {
    var input = resolveInput(target);
    if (input) return input;
    var sidebar = resolveSidebar(target);
    if (sidebar) return sidebar;
    var trajectory = resolveTrajectoryRow(target);
    if (trajectory) return trajectory;
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

  var MESSAGE_FLOW_KINDS = [
    "user",
    "assistant-step",
    "tool-call",
    "context",
    "command"
  ];

  function isEditableContext(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      "textarea, input, [contenteditable='true'], [contenteditable='']"
    );
  }

  function hasText(el) {
    return !!(el && (el.textContent || "").replace(/\s+/g, "").length);
  }

  function collectMessageRowsInOrder() {
    var rows = [];
    for (var k = 0; k < MESSAGE_FLOW_KINDS.length; k++) {
      var kind = MESSAGE_FLOW_KINDS[k];
      var found = document.querySelectorAll(
        '[data-chat-flow-kind="' + kind + '"]'
      );
      for (var i = 0; i < found.length; i++) rows.push(found[i]);
    }
    rows.sort(function (a, b) {
      var pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    return rows;
  }

  function isNoSelectElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (
      el.closest(
        "button, [role='menu'], [role='menuitem'], [data-dsh-shell-no-select], [data-dsh-shell-code-header]"
      )
    ) {
      return true;
    }
    try {
      var style = window.getComputedStyle(el);
      if (style.userSelect === "none" || style.webkitUserSelect === "none") {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function isSelectableTextNode(node) {
    if (!node || node.nodeType !== 3) return false;
    if (!node.nodeValue || !node.nodeValue.replace(/\s+/g, "").length) return false;
    var parent = node.parentElement;
    if (!parent || isNoSelectElement(parent)) return false;
    return true;
  }

  function walkTextNodes(root, visit) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return isSelectableTextNode(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    });
    var node;
    while ((node = walker.nextNode())) visit(node);
  }

  function firstLastTextNodes(roots) {
    var first = null;
    var last = null;
    for (var i = 0; i < roots.length; i++) {
      walkTextNodes(roots[i], function (node) {
        if (!first) first = node;
        last = node;
      });
    }
    return { first: first, last: last };
  }

  function selectTextInRoots(roots) {
    var ends = firstLastTextNodes(roots);
    if (!ends.first || !ends.last) return false;
    try {
      var sel = window.getSelection();
      if (!sel) return false;
      var first = ends.first;
      var last = ends.last;
      if (
        first.compareDocumentPosition(last) &
        Node.DOCUMENT_POSITION_PRECEDING
      ) {
        var swap = first;
        first = last;
        last = swap;
      }
      var range = document.createRange();
      range.setStart(first, 0);
      range.setEnd(last, last.nodeValue.length);
      sel.removeAllRanges();
      sel.addRange(range);
      return sel.rangeCount > 0;
    } catch (e) {
      return false;
    }
  }

  function collectTrajectoryRowsInOrder() {
    var found = document.querySelectorAll("tr[data-trajectory-row-key]");
    var rows = [];
    for (var i = 0; i < found.length; i++) {
      if (isTrajectoryDataRow(found[i])) rows.push(found[i]);
    }
    return rows;
  }

  function copyablesInUserRow(row) {
    var out = [];
    var hoverRoot = row.querySelector("[data-time-hover-root]");
    if (hoverRoot) {
      for (var c = 0; c < hoverRoot.children.length; c++) {
        var child = hoverRoot.children[c];
        if (isMessageBubbleContainer(child)) out.push(child);
      }
    }
    if (out.length === 0 && hasText(row)) out.push(row);
    return out;
  }

  function copyablesInConversationRow(row, kind) {
    if (kind === "user") return copyablesInUserRow(row);

    var out = [];
    var seen = [];
    function add(el) {
      if (!el || !hasText(el)) return;
      for (var i = 0; i < seen.length; i++) {
        if (seen[i] === el || seen[i].contains(el) || el.contains(seen[i])) {
          return;
        }
      }
      seen.push(el);
      out.push(el);
    }

    var codeBlocks = row.querySelectorAll("[class*='md-code-block']");
    for (var cb = 0; cb < codeBlocks.length; cb++) {
      add(resolveCodeCopyTarget(codeBlocks[cb]));
    }

    var segments = row.querySelectorAll(
      "p, pre, blockquote, li, table, h1, h2, h3, h4, h5, h6"
    );
    for (var s = 0; s < segments.length; s++) {
      var seg = segments[s];
      if (isContentChrome(seg)) continue;
      if (seg.closest("[data-dsh-shell-code-header]")) continue;
      add(seg);
    }

    var panels = row.querySelectorAll(
      '[class*="thinkBody"], [data-slot="tool.call.toolview"], [class*="toolview"], [class*="toolView"], [class*="toolBody"], [class*="tool-body"]'
    );
    for (var p = 0; p < panels.length; p++) {
      if (isContentChrome(panels[p])) continue;
      add(panels[p]);
    }

    if (out.length === 0 && hasText(row)) out.push(row);
    return out;
  }

  function collectConversationSegments() {
    var segments = [];
    var rows = collectMessageRowsInOrder();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (isContentChrome(row)) continue;
      var kind = row.getAttribute("data-chat-flow-kind") || "";
      var parts = copyablesInConversationRow(row, kind);
      for (var j = 0; j < parts.length; j++) segments.push(parts[j]);
    }
    return segments;
  }

  // 轨迹页：整行（角色徽标 + 正文）；DOM 用 data-trajectory-row-key，非 chat-flow
  function selectAllTrajectoryView() {
    var rows = collectTrajectoryRowsInOrder();
    if (rows.length === 0) return false;
    return selectTextInRoots(rows);
  }

  function selectTrajectoryRow(row) {
    if (!row) return false;
    return selectTextInRoots([row]);
  }

  // 对话页：仅正文片段（代码块不含 python/复制 顶栏）
  function selectAllConversationView() {
    var segments = collectConversationSegments();
    if (segments.length > 0) return selectTextInRoots(segments);
    var hero = document.querySelector('[data-slot^="conversation.hero."]');
    if (!hero) return false;
    return selectTextInRoots([hero]);
  }

  function selectAllPrimaryView() {
    if (isTrajectoryViewActive()) return selectAllTrajectoryView();
    return selectAllConversationView();
  }

  function selectAllInDialogRoot(root) {
    if (!root) return false;
    var leaves = root.querySelectorAll(
      "p, li, span, label, h1, h2, h3, h4, h5, h6, td, th, pre"
    );
    var withText = [];
    for (var i = 0; i < leaves.length; i++) {
      var leaf = leaves[i];
      if (leaf.closest("button, [role='menu'], [role='menuitem']")) continue;
      if (hasText(leaf)) withText.push(leaf);
    }
    if (withText.length === 0) return false;
    return selectTextInRoots(withText);
  }

  function onCtrlAKeydown(ev) {
    if (!(ev.ctrlKey || ev.metaKey) || (ev.key !== "a" && ev.key !== "A")) {
      return;
    }
    if (isEditableContext(ev.target)) return;
    // 关：不拦截，iframe 内走浏览器原生 Ctrl+A（无壳选区约束）
    if (!isSelectionHygieneOn()) return;

    if (window.__dshShellModalOpen === true) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      clearSelection();
      return;
    }

    var dialog =
      ev.target &&
      ev.target.closest &&
      ev.target.closest('[role="dialog"][aria-modal="true"]');
    if (dialog) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!selectAllInDialogRoot(dialog)) clearSelection();
      return;
    }

    if (
      isInTrajectoryArea(ev.target) ||
      isTrajectoryViewActive() ||
      isInChatArea(ev.target) ||
      collectMessageRowsInOrder().length > 0 ||
      document.querySelector('[data-slot^="conversation.hero."]')
    ) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (!selectAllPrimaryView()) clearSelection();
      return;
    }

    ev.preventDefault();
    ev.stopImmediatePropagation();
    clearSelection();
  }

  function runContentAction(ctx, action) {
    try {
      if (action === "selectAll") {
        if (!isSelectionHygieneOn()) {
          runNativeSelectAll();
          return;
        }
        if (!selectAllPrimaryView()) clearSelection();
        return;
      }
      var block = ctx && ctx.block;
      if (!block) return;
      if (action === "copy") {
        var sel = window.getSelection();
        var copyTarget = ctx.trajectory
          ? block
          : isSelectionHygieneOn()
            ? resolveCodeCopyTarget(block) || block
            : block;
        var hasSelection =
          sel &&
          !sel.isCollapsed &&
          (sel.toString() || "").trim().length > 0 &&
          copyTarget.contains(sel.anchorNode);
        if (!hasSelection) {
          if (ctx.trajectory) selectTrajectoryRow(block);
          else selectBlockText(block);
        }
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
        if (!isEditableContext(document.activeElement)) {
          clearSelection();
        }
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
    if (d.type === "selection-hygiene") {
      setSelectionHygieneOn(d.enabled === true);
      return;
    }
    if (d.type === "shell-select-all") {
      try {
        if (!isSelectionHygieneOn()) runNativeSelectAll();
        else if (!selectAllPrimaryView()) clearSelection();
      } catch (e) {}
      return;
    }
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

  document.addEventListener("keydown", onCtrlAKeydown, true);
})();
"#;
