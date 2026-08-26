// B49 — clipboard service (iframe)
(function (global) {
  if (!global.__dshShellGuardOk) return;

  function selectionSnapshot(sel) {
    sel = sel || global.getSelection();
    if (!sel) return { selLen: 0, trimLen: 0, collapsed: true };
    var text = sel.toString() || "";
    return {
      selLen: text.length,
      trimLen: text.replace(/\s+/g, " ").trim().length,
      collapsed: sel.isCollapsed,
    };
  }

  function execCopy(suppressFlag, via, emitDiag) {
    var snap = selectionSnapshot();
    if (suppressFlag) suppressFlag.value = true;
    var ok = false;
    try {
      ok = !!document.execCommand("copy");
    } catch (e) {}
    if (suppressFlag) suppressFlag.value = false;
    if (emitDiag) {
      emitDiag("copy-exec", {
        via: via || "unknown",
        ok: ok,
        selLen: snap.selLen,
        trimLen: snap.trimLen,
        collapsed: snap.collapsed,
      });
    }
    return ok;
  }

  /**
   * Menu/content copy: keep live selection + execCommand.
   * Shell must writeText when gesture is on shell (see bridge).
   */
  function copyActiveSelection(opts) {
    opts = opts || {};
    var fallbackBlock = opts.fallbackBlock || null;
    var trajectory = !!opts.trajectory;
    var via = opts.via || "copy-active";
    var suppressFlag = opts.suppressFlag || null;
    var emitDiag = opts.emitDiag || null;
    var selectBlock = opts.selectBlock;
    var selectTrajectory = opts.selectTrajectory;
    var clearSelection = opts.clearSelection;
    var notifyCopied = opts.notifyCopied;

    var sel = global.getSelection();
    var text = sel ? (sel.toString() || "").trim() : "";
    var hasSelection = !!(sel && !sel.isCollapsed && text.length > 0);
    var pickedBlock = false;
    if (!hasSelection && fallbackBlock) {
      if (trajectory && selectTrajectory) selectTrajectory(fallbackBlock);
      else if (selectBlock) selectBlock(fallbackBlock);
      pickedBlock = true;
      sel = global.getSelection();
      text = sel ? (sel.toString() || "").trim() : "";
    }
    if (!text) {
      if (emitDiag) {
        emitDiag("menu-copy", {
          via: via,
          hadSelection: 0,
          pickedBlock: pickedBlock ? 1 : 0,
          copyOk: 0,
          skip: 1,
          reason: "empty",
        });
      }
      return false;
    }
    var copyOk = execCopy(suppressFlag, via, emitDiag);
    if (copyOk) {
      if (clearSelection) clearSelection();
      if (notifyCopied) notifyCopied();
    }
    if (emitDiag) {
      emitDiag("menu-copy", {
        via: via,
        hadSelection: hasSelection ? 1 : 0,
        pickedBlock: pickedBlock ? 1 : 0,
        copyOk: copyOk ? 1 : 0,
      });
    }
    return copyOk;
  }

  global.__dshShell = global.__dshShell || {};
  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.clipboard = {
    selectionSnapshot: selectionSnapshot,
    execCopy: execCopy,
    copyActiveSelection: copyActiveSelection,
  };
})(typeof window !== "undefined" ? window : globalThis);
