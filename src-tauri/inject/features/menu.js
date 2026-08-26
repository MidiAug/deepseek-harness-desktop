// B49 — context menu feature（事件接线；业务在 services）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var kernel = global.__dshShell.kernel;
  var zone = global.__dshShell.services.zone;
  var selection = global.__dshShell.services.selection;
  var clipboard = global.__dshShell.services.clipboard;
  var textEdit = global.__dshShell.services.textEdit;
  var sidebar = global.__dshShell.services.sidebar;
  var dom = global.__dshShell.dom;
  var state = global.__dshShell.state;

  var lastContext = null;
  var suppressCopyToast = { value: false };

  function notifyCopied() {
    kernel.postToShell({ type: "copied" });
  }

  function runTextAction(editable, action) {
    if (!editable || !textEdit) return;
    if (action === "copy") {
      var start =
        editable.selectionStart != null ? editable.selectionStart : null;
      var end = editable.selectionEnd != null ? editable.selectionEnd : null;
      var ok = textEdit.runOnEditable(editable, "copy", suppressCopyToast);
      if (ok) {
        if (
          start != null &&
          end != null &&
          (editable.selectionStart !== start || editable.selectionEnd !== end)
        ) {
          try {
            editable.setSelectionRange(start, end);
          } catch (e) {}
        }
        notifyCopied();
      }
      return;
    }
    textEdit.runOnEditable(editable, action, suppressCopyToast);
  }

  function runContentAction(ctx, action) {
    try {
      if (action === "selectAll") {
        if (!dom.isHygieneOn()) {
          selection.runNativeSelectAll();
          return;
        }
        var allOk = selection.selectAllPrimaryView();
        kernel.emitDiag("menu-select-all", { ok: allOk });
        if (!allOk) selection.clearSelection();
        return;
      }
      var block = ctx && ctx.block;
      if (!block) {
        kernel.emitDiag("menu-copy", { skip: 1, reason: "no-block" });
        return;
      }
      if (action === "copy") {
        var copyTarget = ctx.trajectory
          ? block
          : dom.isHygieneOn()
            ? selection.resolveCodeCopyTarget(block) || block
            : block;
        clipboard.copyActiveSelection({
          fallbackBlock: copyTarget,
          trajectory: !!ctx.trajectory,
          via: "menu-content",
          suppressFlag: suppressCopyToast,
          emitDiag: kernel.emitDiag,
          selectBlock: selection.selectBlockText,
          selectTrajectory: selection.selectTrajectoryRow,
          clearSelection: selection.clearSelection,
          notifyCopied: notifyCopied,
        });
      }
    } catch (e) {
      kernel.emitDiag("menu-action-err", { action: action, err: 1 });
    }
  }

  function stashContext(ctx) {
    lastContext = ctx;
    kernel.setMenuContext(ctx);
  }

  function onContextMenu(ev) {
    try {
      ev.preventDefault();
      ev.stopPropagation();
      var ctx = zone.resolveZone(ev.target);
      if (!ctx) {
        lastContext = null;
        kernel.setMenuContext(null);
        return;
      }
      var selectedText = "";
      if (ctx.zone === "content" || ctx.zone === "input") {
        if (ctx.zone === "input" && ctx.editable) {
          var ed = ctx.editable;
          if (ed.selectionStart != null && ed.selectionEnd != null) {
            selectedText = String(ed.value || "").slice(
              ed.selectionStart,
              ed.selectionEnd,
            );
          }
        } else {
          var live = global.getSelection();
          selectedText = live ? (live.toString() || "").trim() : "";
        }
        selectedText = (selectedText || "").trim();
        if (selectedText) ctx.selectedText = selectedText;
      }
      stashContext(ctx);
      kernel.postToShell({
        type: "open",
        zone: ctx.zone,
        x: ev.clientX,
        y: ev.clientY,
        selectedText: selectedText || undefined,
      });
    } catch (e) {}
  }

  function onCopyCapture() {
    var snap = clipboard.selectionSnapshot();
    if (suppressCopyToast.value) {
      kernel.emitDiag("copy-event", {
        suppressed: 1,
        selLen: snap.selLen,
        trimLen: snap.trimLen,
      });
      return;
    }
    try {
      var du = global.__dshShell.services.dom;
      var selObj = global.getSelection();
      if (!selObj || selObj.isCollapsed) {
        kernel.emitDiag("copy-event", {
          skip: 1,
          reason: "collapsed",
          selLen: snap.selLen,
        });
        return;
      }
      if (!(selObj.toString() || "").trim()) {
        kernel.emitDiag("copy-event", {
          skip: 1,
          reason: "empty",
          selLen: snap.selLen,
        });
        return;
      }
      kernel.emitDiag("copy-event", {
        toast: 1,
        via: "native",
        selLen: snap.selLen,
        trimLen: snap.trimLen,
      });
      if (!du.isEditableContext(document.activeElement)) {
        setTimeout(function () {
          selection.clearSelection();
        }, 0);
      }
      notifyCopied();
    } catch (e) {}
  }

  kernel.registerFeature("menu", function () {
    document.addEventListener("copy", onCopyCapture, true);
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (ev && ev.target) state.lastPointerTarget = ev.target;
      },
      true,
    );
    document.addEventListener(
      "mousedown",
      function () {
        kernel.postToShell({ type: "close" });
      },
      true,
    );
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", selection.onCtrlAKeydown, true);

    kernel.onShellMessageType("context-menu-action", function (d) {
      kernel.emitDiag("menu-action", {
        action: d.action,
        hasCtx: lastContext ? 1 : 0,
      });
      if (!lastContext) return;
      try {
        if (lastContext.zone === "input") {
          runTextAction(lastContext.editable, d.action);
        } else if (lastContext.zone === "content") {
          runContentAction(lastContext, d.action);
        } else if (lastContext.row) {
          sidebar.proxyAction(lastContext.row, d.action);
        }
      } catch (e) {}
      lastContext = null;
      kernel.setMenuContext(null);
    });

    kernel.onShellMessageType("shell-select-all", function () {
      try {
        if (!dom.isHygieneOn()) {
          selection.runNativeSelectAll();
          return;
        }
        var du = global.__dshShell.services.dom;
        var ae = document.activeElement;
        if (du.isEditableContext(ae)) {
          try {
            ae.select && ae.select();
          } catch (e2) {}
          return;
        }
        var anchor =
          state.lastPointerTarget && document.contains(state.lastPointerTarget)
            ? state.lastPointerTarget
            : ae || document.body;
        var z = zone.resolveSelectAllZone(anchor);
        if (z === "chat" || z === "trajectory") {
          if (!selection.selectAllForZone(z)) selection.clearSelection();
        } else {
          selection.clearSelection();
        }
      } catch (e) {}
    });
  });
})(typeof window !== "undefined" ? window : globalThis);
