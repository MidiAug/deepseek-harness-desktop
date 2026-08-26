// B49 — zone resolver — 右键/Ctrl+A 分区（DSH DOM 变更只改 selectors）
(function (global) {
  if (!global.__dshShellGuardOk) return;
  var dom = global.__dshShell.dom;
  var sel = global.__dshShell.selectors;
  var du = global.__dshShell.services.dom;

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
      if (label.indexOf("的操作") >= 0 || /actions?\s+for/i.test(label)) {
        return buttons[j];
      }
    }
    if (buttons.length === 1) return buttons[0];
    if (buttons.length > 1) return buttons[buttons.length - 1];
    return null;
  }

  function resolveInput(target) {
    if (!target || !target.closest) return null;
    var editable = dom.closest(target, sel.editableCandidates);
    if (!editable) return null;
    if (
      editable.tagName.toLowerCase() === "input" &&
      !du.isTextInput(editable)
    ) {
      return null;
    }
    return { zone: "input", editable: editable };
  }

  function resolveSidebar(target) {
    if (!target || !target.closest) return null;
    if (!dom.closest(target, sel.sidebarCandidates)) return null;
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
    return !!dom.closest(el, sel.disclosureCandidates);
  }

  function isContentChrome(el) {
    if (!el || !el.closest) return true;
    if (dom.closest(el, sel.sidebarCandidates)) return true;
    if (dom.closest(el, sel.sessionHeaderCandidates)) return true;
    if (dom.isHygieneOn() && dom.closest(el, sel.heroCandidates)) return true;
    if (dom.closest(el, sel.composerBarCandidates)) return true;
    if (dom.closest(el, sel.composerDockCandidates)) return true;
    if (dom.closest(el, sel.inputDockCandidates)) return true;
    if (dom.closest(el, sel.turnTailCandidates)) return true;
    if (dom.closest(el, sel.assistantActionsCandidates)) return true;
    if (el.closest("button, [role='menu'], [role='menuitem']")) return true;
    if (el.closest("[role='button']")) {
      if (isDisclosureTarget(el)) return false;
      return true;
    }
    return false;
  }

  function isMessageBubbleContainer(el) {
    if (!el || du.isTextInput(el)) return false;
    if (el.querySelector('[data-slot="conversation.message.images"]')) return true;
    if (el.querySelector("p, pre, blockquote, h1, h2, h3, h4, li, table")) {
      return true;
    }
    if (el.querySelector("textarea, input, [contenteditable]")) return true;
    if (el.querySelector("button, [role='button']")) return false;
    return du.hasText(el);
  }

  function resolveUserBubble(target, userRow) {
    var hoverRoot = userRow.querySelector(sel.userHoverRoot);
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
    if (dom.closest(el, sel.sidebarCandidates)) return false;
    if (dom.closest(el, sel.composerBarCandidates)) return false;
    if (dom.closest(el, sel.inputDockCandidates)) return false;
    return !!dom.closest(el, sel.chatAreaCandidates);
  }

  function resolveDisclosurePanel(target) {
    var row = dom.closest(target, ["[data-disclosure-row]"]);
    if (!row) return null;
    var body = dom.closest(target, [sel.thinkBody]);
    if (body) return body;
    if (row.getAttribute("aria-expanded") === "true") {
      var sibling = row.nextElementSibling;
      if (sibling) return sibling;
    }
    var panel = dom.closest(target, ["[data-variant]", "[data-tool]"]);
    if (panel) return panel;
    var cmd = dom.closest(target, sel.commandViewCandidates);
    if (cmd) return cmd;
    return row.parentElement || row;
  }

  function resolveCopyablePanel(target) {
    if (!target || !target.closest || isContentChrome(target)) return null;
    var disclosure = resolveDisclosurePanel(target);
    if (disclosure && isInChatArea(disclosure)) return disclosure;
    var thinkBody = dom.closest(target, [sel.thinkBody]);
    if (thinkBody && isInChatArea(thinkBody)) return thinkBody;
    var toolview = dom.closest(target, [sel.toolView]);
    if (toolview) return toolview;
    var toolPanel = dom.closest(target, sel.toolViewCandidates);
    if (toolPanel && isInChatArea(toolPanel)) return toolPanel;
    return null;
  }

  function resolveNearestSegment(target) {
    if (!target || !target.closest) return null;
    for (var i = 0; i < sel.segmentCandidates.length; i++) {
      var seg = target.closest(sel.segmentCandidates[i]);
      if (!seg || isContentChrome(seg)) continue;
      if (isInChatArea(seg)) return seg;
    }
    return null;
  }

  function resolveContentBlock(target) {
    if (!target || !target.closest) return null;
    if (isContentChrome(target)) return null;
    var hero = dom.closest(target, sel.heroCandidates);
    if (hero) {
      if (dom.isHygieneOn()) return null;
      return { zone: "content", block: hero };
    }
    var panel = resolveCopyablePanel(target);
    if (panel) return { zone: "content", block: panel };
    var segment = resolveNearestSegment(target);
    if (segment) return { zone: "content", block: segment };
    var userRow = dom.closest(target, sel.userMessageCandidates);
    if (userRow) {
      return { zone: "content", block: resolveUserBubble(target, userRow) };
    }
    return null;
  }

  function isTrajectoryViewActive() {
    var scroll = dom.queryFirst(sel.trajectoryScrollCandidates);
    if (scroll && scroll.offsetParent !== null) return true;
    var tabs = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on =
        tab.getAttribute("aria-selected") === "true" ||
        tab.getAttribute("data-state") === "active";
      if (!on) continue;
      var label = (tab.textContent || "").replace(/\s+/g, " ").trim();
      for (var j = 0; j < sel.trajectoryTabLabels.length; j++) {
        var key = sel.trajectoryTabLabels[j];
        if (label === key || new RegExp(key, "i").test(label)) return true;
      }
    }
    return false;
  }

  function isInTrajectoryArea(el) {
    return !!dom.closest(el, sel.trajectoryAreaCandidates);
  }

  function isTrajectoryDataRow(row) {
    if (!row || row.getAttribute("data-trajectory-row-key") == null) return false;
    if (row.hasAttribute("data-history-load")) return false;
    if (!du.hasText(row)) return false;
    return row.offsetParent !== null;
  }

  function resolveTrajectoryRow(target) {
    if (!target || !target.closest) return null;
    if (
      !isTrajectoryViewActive() &&
      !dom.closest(target, sel.trajectoryScrollCandidates)
    ) {
      return null;
    }
    if (isContentChrome(target)) return null;
    var row = dom.closest(target, sel.trajectoryRowCandidates);
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

  function isHomeSurface() {
    return !!dom.queryFirst(sel.heroCandidates);
  }

  function hasChatCopyableSurface() {
    if (dom.queryFirst(sel.chatFlowCandidates)) return true;
    for (var k = 0; k < sel.messageFlowKinds.length; k++) {
      var kind = sel.messageFlowKinds[k];
      if (document.querySelector('[data-chat-flow-kind="' + kind + '"]')) {
        return true;
      }
    }
    return false;
  }

  function resolveSelectAllZone(target) {
    if (!target || !target.closest) return "none";
    if (du.isEditableContext(target)) return "input";
    if (dom.closest(target, sel.sidebarCandidates)) return "sidebar";
    if (dom.closest(target, sel.sessionHeaderCandidates)) return "header";
    if (dom.closest(target, sel.heroCandidates)) return "hero";
    if (
      dom.closest(target, sel.turnTailCandidates) ||
      dom.closest(target, sel.assistantActionsCandidates)
    ) {
      return "chrome";
    }
    if (isInTrajectoryArea(target)) return "trajectory";
    if (isTrajectoryViewActive()) {
      if (dom.closest(target, sel.trajectoryViewZoneCandidates)) {
        return "trajectory";
      }
    }
    if (isInChatArea(target) || dom.closest(target, sel.chatFlowCandidates)) {
      return "chat";
    }
    if (
      hasChatCopyableSurface() &&
      !isHomeSurface() &&
      dom.closest(target, sel.conversationScrollCandidates)
    ) {
      if (dom.closest(target, sel.composerDockCandidates)) return "chrome";
      if (
        dom.closest(target, sel.composerBarCandidates) &&
        !du.isEditableContext(target)
      ) {
        return "chrome";
      }
      return "chat";
    }
    return "chrome";
  }

  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.zone = {
    resolveZone: resolveZone,
    resolveSelectAllZone: resolveSelectAllZone,
    isContentChrome: isContentChrome,
    isInChatArea: isInChatArea,
    isTrajectoryViewActive: isTrajectoryViewActive,
    isInTrajectoryArea: isInTrajectoryArea,
    isTrajectoryDataRow: isTrajectoryDataRow,
    isMessageBubbleContainer: isMessageBubbleContainer,
    isHomeSurface: isHomeSurface,
    hasChatCopyableSurface: hasChatCopyableSurface,
    resolveInput: resolveInput,
  };
})(typeof window !== "undefined" ? window : globalThis);
