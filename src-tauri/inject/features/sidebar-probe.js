// B49 — sidebar probe feature（轮询 + resize → postMessage）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var kernel = global.__dshShell.kernel;
  var probe = global.__dshShell.services.sidebarProbe;

  kernel.registerFeature("sidebar-probe", function () {
    var lastSent = { w: null, c: null, t: 0 };
    var pendingTimer = null;
    var resizeTimer = null;

    function report(force) {
      try {
        var payload = probe.findSidebarWidth();
        payload.source = "dsh-shell-sidebar-probe";
        payload.method = "webview-init-inject";
        var now = Date.now();
        if (!force && payload.ok) {
          if (
            payload.widthPx === lastSent.w &&
            payload.collapsed === lastSent.c
          ) {
            return;
          }
          if (now - lastSent.t < 150) {
            if (pendingTimer == null) {
              pendingTimer = setTimeout(function () {
                pendingTimer = null;
                report(true);
              }, 150);
            }
            return;
          }
        }
        if (payload.ok) {
          lastSent.w = payload.widthPx;
          lastSent.c = payload.collapsed;
          lastSent.t = now;
        }
        global.parent.postMessage(payload, "*");
      } catch (err) {
        global.parent.postMessage(
          {
            source: "dsh-shell-sidebar-probe",
            method: "webview-init-inject",
            ok: false,
            widthPx: null,
            detail: "inject error: " + String(err),
          },
          "*",
        );
      }
    }

    setInterval(function () {
      report(false);
    }, 1000);
    global.addEventListener("resize", function () {
      if (resizeTimer != null) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = null;
        report(false);
      }, 150);
    });
    if (document.readyState === "complete") report(true);
    else {
      global.addEventListener("load", function () {
        report(true);
      });
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
