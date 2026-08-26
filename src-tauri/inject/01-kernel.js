// B49 — inject kernel: namespace, bus, diag, menu context, feature registry
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var INJECT_DIAG = false;
  var MSG_SOURCE = "dsh-shell-context-menu";
  var SHELL_SOURCE = "dsh-shell";

  var lastMenuContext = null;
  var shellMessageHandlers = [];
  var features = {};

  function emitInjectError(event, fields) {
    try {
      var payload = { source: MSG_SOURCE, type: "inject-error", event: event };
      if (fields) {
        for (var k in fields) {
          if (Object.prototype.hasOwnProperty.call(fields, k)) {
            payload[k] = fields[k];
          }
        }
      }
      global.parent.postMessage(payload, "*");
    } catch (e) {}
  }

  function emitDiag(event, fields) {
    if (!INJECT_DIAG) return;
    postDiag(event, fields);
  }

  function postDiag(event, fields) {
    try {
      var payload = { source: MSG_SOURCE, type: "diag", event: event };
      if (fields) {
        for (var k in fields) {
          if (Object.prototype.hasOwnProperty.call(fields, k)) {
            payload[k] = fields[k];
          }
        }
      }
      global.parent.postMessage(payload, "*");
    } catch (e) {}
  }

  /** 全选失败诊断：由壳 postMessage 开启，仅上报 ok=0。 */
  function emitSelectionTrace(event, fields) {
    if (global.__dshSelectionTrace !== true) return;
    postDiag(event, fields);
  }

  function postToShell(payload) {
    try {
      global.parent.postMessage(
        Object.assign({ source: MSG_SOURCE }, payload),
        "*"
      );
    } catch (e) {}
  }

  function setMenuContext(ctx) {
    lastMenuContext = ctx || null;
  }

  function getMenuContext() {
    return lastMenuContext;
  }

  /** 壳消息多路分发：各 feature/service 注册 handler，单条失败不拖垮全局 */
  function onShellMessage(ev) {
    if (!ev || !ev.origin) return;
    var origin = String(ev.origin);
    var okOrigin =
      origin === global.location.origin ||
      /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|tauri\.localhost|asset\.localhost)(:\d+)?$/i.test(
        origin,
      );
    if (!okOrigin) return;
    var d = ev && ev.data;
    if (!d || d.source !== SHELL_SOURCE) return;
    if (d.type === "desktop-action") {
      try {
        var svc = global.__dshShell && global.__dshShell.services;
        if (svc && svc.textEdit) {
          svc.textEdit.handleDesktopAction(d, lastMenuContext, emitDiag);
        }
      } catch (e) {
        emitInjectError("desktop-action-err", { err: 1 });
        emitDiag("desktop-action-err", { err: 1 });
      }
      return;
    }
    for (var i = 0; i < shellMessageHandlers.length; i++) {
      try {
        if (shellMessageHandlers[i](d, ev) === true) return;
      } catch (e) {
        emitInjectError("shell-handler-err", { index: i, type: d.type || "" });
        emitDiag("shell-handler-err", { index: i, type: d.type || "" });
      }
    }
  }

  function onShellMessageType(type, handler) {
    shellMessageHandlers.push(function (d) {
      if (d.type !== type) return false;
      handler(d);
      return true;
    });
  }

  /** 特性安全启动：init 抛错仅记 diag，不阻断后续 bundle */
  function registerFeature(name, initFn) {
    if (!initFn) return;
    try {
      initFn();
      features[name] = true;
    } catch (e) {
      features[name] = false;
      emitInjectError("feature-init-err", { name: name });
      emitDiag("feature-init-err", { name: name });
    }
  }

  global.addEventListener("message", onShellMessage);

  global.__dshShell = global.__dshShell || {};
  global.__dshShell.state = global.__dshShell.state || { lastPointerTarget: null };
  global.__dshShell.kernel = {
    MSG_SOURCE: MSG_SOURCE,
    SHELL_SOURCE: SHELL_SOURCE,
    emitDiag: emitDiag,
    emitSelectionTrace: emitSelectionTrace,
    postToShell: postToShell,
    setMenuContext: setMenuContext,
    getMenuContext: getMenuContext,
    onShellMessageType: onShellMessageType,
    registerFeature: registerFeature,
    INJECT_DIAG: INJECT_DIAG,
  };
})(typeof window !== "undefined" ? window : globalThis);
