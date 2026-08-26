// B49 — hygiene feature（MutationObserver + kernel 消息）
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var kernel = global.__dshShell.kernel;
  var hygiene = global.__dshShell.services.hygiene;

  kernel.registerFeature("hygiene", function () {
    kernel.onShellMessageType("selection-hygiene", function (d) {
      hygiene.setEnabled(d.enabled === true);
    });
    kernel.onShellMessageType("shell-modal-open", function (d) {
      hygiene.setShellModalOpen(d.open === true);
    });
    kernel.onShellMessageType("clear-selection", function () {
      hygiene.clearSelection();
    });

    function boot() {
      hygiene.refresh();
      var obs = new MutationObserver(function () {
        if (boot._t) clearTimeout(boot._t);
        boot._t = setTimeout(hygiene.refresh, 200);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
