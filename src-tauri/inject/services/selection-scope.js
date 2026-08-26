// B49 — selection scope — 全选/块选/轨迹选
(function (global) {
  if (!global.__dshShellGuardOk) return;
  var dom = global.__dshShell.dom;
  var sel = global.__dshShell.selectors;
  var du = global.__dshShell.services.dom;
  var zoneSvc = global.__dshShell.services.zone;
  var clip = global.__dshShell.services.clipboard;
  var emitDiag = function (e, f) {
    var k = global.__dshShell.kernel;
    if (k && k.emitDiag) k.emitDiag(e, f);
  };
  var traceSel = function (e, f) {
    var k = global.__dshShell.kernel;
    if (k && k.emitSelectionTrace) k.emitSelectionTrace(e, f);
  };
  function selectionSnapshot() {
    return clip && clip.selectionSnapshot
      ? clip.selectionSnapshot()
      : { selLen: 0, trimLen: 0 };
  }

  function runNativeSelectAll() {
    try {
      document.execCommand("selectAll");
    } catch (e) {}
  }

  function clearSelection() {
    var s = window.getSelection();
    if (s) s.removeAllRanges();
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

  function collectMessageRowsInOrder() {
    var rows = [];
    for (var k = 0; k < sel.messageFlowKinds.length; k++) {
      var kind = sel.messageFlowKinds[k];
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
    if (!ends.first || !ends.last) {
      traceSel("sel-roots", {
        ok: 0,
        roots: roots.length,
        reason: "no-text",
      });
      emitDiag("select-roots", { ok: false, roots: roots.length, reason: "no-text" });
      return false;
    }
    try {
      var sel = window.getSelection();
      if (!sel) {
        emitDiag("select-roots", { ok: false, roots: roots.length, reason: "no-sel" });
        return false;
      }
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
      var snap = selectionSnapshot();
      var ok = sel.rangeCount > 0;
      if (!ok) {
        traceSel("sel-roots", {
          ok: 0,
          roots: roots.length,
          selLen: snap.selLen,
          trimLen: snap.trimLen,
        });
      }
      emitDiag("select-roots", {
        ok: ok,
        roots: roots.length,
        selLen: snap.selLen,
        trimLen: snap.trimLen
      });
      return ok;
    } catch (e) {
      emitDiag("select-roots", { ok: false, roots: roots.length, reason: "exception" });
      return false;
    }
  }

  function collectTrajectoryRowsInOrder() {
    var found = document.querySelectorAll("tr[data-trajectory-row-key]");
    var rows = [];
    for (var i = 0; i < found.length; i++) {
      if (zoneSvc.isTrajectoryDataRow(found[i])) rows.push(found[i]);
    }
    return rows;
  }

  function copyablesInUserRow(row) {
    var out = [];
    var hoverRoot = row.querySelector("[data-time-hover-root]");
    if (hoverRoot) {
      for (var c = 0; c < hoverRoot.children.length; c++) {
        var child = hoverRoot.children[c];
        if (zoneSvc.isMessageBubbleContainer(child)) out.push(child);
      }
    }
    if (out.length === 0 && du.hasText(row)) out.push(row);
    return out;
  }

  function copyablesInConversationRow(row, kind) {
    if (kind === "user") return copyablesInUserRow(row);

    var out = [];
    var seen = [];
    function add(el) {
      if (!el || !du.hasText(el)) return;
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
      if (zoneSvc.isContentChrome(seg)) continue;
      if (seg.closest("[data-dsh-shell-code-header]")) continue;
      add(seg);
    }

    var panels = row.querySelectorAll(
      '[class*="thinkBody"], [data-slot="tool.call.toolview"], [class*="toolview"], [class*="toolView"], [class*="toolBody"], [class*="tool-body"]'
    );
    for (var p = 0; p < panels.length; p++) {
      if (zoneSvc.isContentChrome(panels[p])) continue;
      add(panels[p]);
    }

    if (out.length === 0 && du.hasText(row)) out.push(row);
    return out;
  }

  function collectConversationSegments() {
    var segments = [];
    var rows = collectMessageRowsInOrder();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (zoneSvc.isContentChrome(row)) continue;
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

  // 对话页：仅正文片段（代码块不含 python/复制 顶栏）；无消息则失败（不再 fallback hero）
  function selectAllConversationView() {
    var segments = collectConversationSegments();
    emitDiag("select-all-chat", { segments: segments.length });
    if (segments.length > 0) return selectTextInRoots(segments);
    return false;
  }

  function resolveCtrlAAnchor(ev) {
    var ae = document.activeElement;
    if (du.isEditableContext(ae)) return ae;
    if (ev && du.isEditableContext(ev.target)) return ev.target;
    if (global.__dshShell.state && global.__dshShell.state.lastPointerTarget && document.contains(global.__dshShell.state.lastPointerTarget)) {
      return global.__dshShell.state.lastPointerTarget;
    }
    return (ev && ev.target) || ae;
  }

  function selectAllForZone(zone) {
    if (zone === "input") return false;
    if (zone === "trajectory") return selectAllTrajectoryView();
    if (zone === "chat") return selectAllConversationView();
    return false;
  }

  function selectAllPrimaryView() {
    if (zoneSvc.isTrajectoryViewActive()) return selectAllTrajectoryView();
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
      if (du.hasText(leaf)) withText.push(leaf);
    }
    if (withText.length === 0) return false;
    return selectTextInRoots(withText);
  }

  function onCtrlAKeydown(ev) {
    if (!(ev.ctrlKey || ev.metaKey) || (ev.key !== "a" && ev.key !== "A")) {
      return;
    }
    if (du.isEditableContext(ev.target) || du.isEditableContext(document.activeElement)) {
      return;
    }
    // 关：不拦截，iframe 内走浏览器原生 Ctrl+A（无壳选区约束）
    if (!dom.isHygieneOn()) {
      return;
    }

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

    var anchor = resolveCtrlAAnchor(ev);
    var zone = zoneSvc.resolveSelectAllZone(anchor);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    var selectOk = false;
    if (zone === "chat" || zone === "trajectory") {
      selectOk = !!selectAllForZone(zone);
      if (!selectOk) clearSelection();
    } else {
      clearSelection();
    }
    if (!selectOk) {
      traceSel("sel-ctrl-a", {
        zone: zone,
        ok: 0,
        hygiene: 1,
        anchor: anchor && anchor.tagName ? String(anchor.tagName).toLowerCase() : "?",
      });
    }
    emitDiag("ctrl-a", { zone: zone, selectOk: selectOk });
  }
  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.selection = {
    clearSelection: clearSelection,
    selectBlockText: selectBlockText,
    selectTrajectoryRow: selectTrajectoryRow,
    selectAllForZone: selectAllForZone,
    selectAllPrimaryView: selectAllPrimaryView,
    selectAllInDialogRoot: selectAllInDialogRoot,
    onCtrlAKeydown: onCtrlAKeydown,
    runNativeSelectAll: runNativeSelectAll,
    resolveCtrlAAnchor: resolveCtrlAAnchor,
    collectConversationSegments: collectConversationSegments,
    resolveCodeCopyTarget: resolveCodeCopyTarget,
  };
})(typeof window !== "undefined" ? window : globalThis);
