// B49 — session log feature（kernel 消息 + MutationObserver）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var kernel = global.__dshShell.kernel;
  var sessionLog = global.__dshShell.services.sessionLog;

  kernel.registerFeature("session-log", function () {
    kernel.onShellMessageType("session-log-proxy", function (d) {
      sessionLog.setEnabled(d.enabled === true);
    });
    kernel.onShellMessageType("session-log-click", function () {
      sessionLog.proxyClick();
    });
    kernel.onShellMessageType("session-log-dismiss-dialog", function () {
      sessionLog.dismissSessionExportDialog();
    });

    function boot() {
      sessionLog.hookNavigation();
      sessionLog.reportAvailability();
      var obs = new MutationObserver(function () {
        if (boot._t) clearTimeout(boot._t);
        boot._t = setTimeout(function () {
          sessionLog.refresh();
          sessionLog.reportAvailability();
        }, 160);
      });
      obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
