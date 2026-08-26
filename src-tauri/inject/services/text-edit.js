// B49 — text edit service (iframe): desktop-action + insertText for shell paste
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var du = global.__dshShell.services.dom;

  function resolveEditable(ctx) {
    if (ctx && ctx.editable) return ctx.editable;
    var ae = document.activeElement;
    if (ae && du.isTextInput(ae)) return ae;
    if (ae && ae.isContentEditable) return ae;
    return null;
  }

  function insertTextAtEditable(editable, text) {
    if (!editable || !text) return false;
    try {
      editable.focus();
      if (editable.isContentEditable) {
        return document.execCommand("insertText", false, text);
      }
      if (
        editable instanceof HTMLInputElement ||
        editable instanceof HTMLTextAreaElement
      ) {
        var start = editable.selectionStart != null ? editable.selectionStart : 0;
        var end = editable.selectionEnd != null ? editable.selectionEnd : start;
        var val = editable.value || "";
        editable.value = val.slice(0, start) + text + val.slice(end);
        var pos = start + text.length;
        editable.setSelectionRange(pos, pos);
        editable.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    } catch (e) {}
    return false;
  }

  function runOnEditable(editable, action, suppressFlag) {
    if (!editable) return false;
    try {
      if (action === "copy") {
        if (suppressFlag) suppressFlag.value = true;
        var ok = !!document.execCommand("copy");
        if (suppressFlag) suppressFlag.value = false;
        return ok;
      }
      editable.focus();
      return !!document.execCommand(action);
    } catch (e) {
      return false;
    }
  }

  function handleDesktopAction(d, menuCtx, emitDiag) {
    var action = d.action;
    var editable = resolveEditable(menuCtx);
    if (!editable && menuCtx && menuCtx.zone === "input") {
      editable = menuCtx.editable;
    }
    if (!editable) {
      if (emitDiag) {
        emitDiag("desktop-action", {
          skip: 1,
          reason: "no-editable",
          action: action,
        });
      }
      return false;
    }
    if (action === "paste" && typeof d.text === "string") {
      var pasteOk = insertTextAtEditable(editable, d.text);
      if (emitDiag) {
        emitDiag("desktop-action", { action: "paste", ok: pasteOk ? 1 : 0 });
      }
      return pasteOk;
    }
    var suppress = { value: false };
    var ran = runOnEditable(editable, action, suppress);
    if (emitDiag) emitDiag("desktop-action", { action: action, ok: ran ? 1 : 0 });
    return ran;
  }

  global.__dshShell = global.__dshShell || {};
  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.textEdit = {
    isTextInput: du.isTextInput,
    resolveEditable: resolveEditable,
    insertTextAtEditable: insertTextAtEditable,
    runOnEditable: runOnEditable,
    handleDesktopAction: handleDesktopAction,
  };
})(typeof window !== "undefined" ? window : globalThis);
