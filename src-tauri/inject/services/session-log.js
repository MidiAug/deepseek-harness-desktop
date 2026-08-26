// B49 — session log proxy service
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var sel = global.__dshShell.selectors;

  var STYLE_ID = "dsh-shell-session-log-proxy";
  var MARK = "data-dsh-shell-session-log-hidden";
  var enabled = false;
  var lastReported = null;
  var reportTrueTimer = null;
  var REPORT_TRUE_DELAY_MS = 280;

  function postAvailability(available) {
    try {
      global.parent.postMessage(
        {
          source: "dsh-harness",
          type: "session-log-available",
          available: available,
        },
        "*",
      );
    } catch (e) {}
  }

  function reportAvailabilityNow(available) {
    if (reportTrueTimer) {
      clearTimeout(reportTrueTimer);
      reportTrueTimer = null;
    }
    if (available === lastReported) return;
    lastReported = available;
    postAvailability(available);
  }

  function resetAvailability() {
    reportAvailabilityNow(false);
  }

  function ensureStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!enabled) {
      if (style) style.remove();
      return;
    }
    if (style) return;
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "[" + MARK + "], [" + MARK + "] * { display: none !important; }";
    (document.head || document.documentElement).appendChild(style);
  }

  function clearMarks() {
    var nodes = document.querySelectorAll("[" + MARK + "]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute(MARK);
    }
  }

  function textOf(el) {
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeSessionLog(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var t = textOf(el);
    var aria = (el.getAttribute("aria-label") || "").trim();
    var title = (el.getAttribute("title") || "").trim();
    var hit =
      t === "Session log" ||
      (t.indexOf("Session log") >= 0 && t.length < 48) ||
      aria === "Session log" ||
      aria.indexOf("Session log") >= 0 ||
      title === "Session log";
    if (!hit) return false;
    var r = el.getBoundingClientRect();
    var vw = global.innerWidth || 800;
    if (r.left < vw * 0.45) return false;
    if (r.top > 120) return false;
    return true;
  }

  function findSessionLogControl() {
    var marked = document.querySelector("[" + MARK + "]");
    if (marked) return marked;
    var utilities = document.querySelector(sel.sessionLogUtilities);
    if (utilities) {
      var inUtils = utilities.querySelectorAll(
        "button, a, [role='button']",
      );
      for (var u = 0; u < inUtils.length; u++) {
        if (looksLikeSessionLog(inUtils[u])) return inUtils[u];
      }
    }
    var cands = document.querySelectorAll(
      "button, a, [role='button'], div, span",
    );
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!looksLikeSessionLog(el)) continue;
      var r = el.getBoundingClientRect();
      var area = Math.max(1, r.width * r.height);
      if (area < bestArea && area < 20000) {
        bestArea = area;
        best = el;
      }
    }
    if (!best) return null;
    var cur = best;
    for (var d = 0; d < 4 && cur; d++) {
      var tag = (cur.tagName || "").toLowerCase();
      if (
        tag === "button" ||
        tag === "a" ||
        cur.getAttribute("role") === "button" ||
        typeof cur.onclick === "function"
      ) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return best;
  }

  function reportAvailability() {
    var available = !!findSessionLogControl();
    if (!available) {
      reportAvailabilityNow(false);
      return;
    }
    if (lastReported === true || reportTrueTimer) return;
    reportTrueTimer = setTimeout(function () {
      reportTrueTimer = null;
      if (!findSessionLogControl()) return;
      reportAvailabilityNow(true);
    }, REPORT_TRUE_DELAY_MS);
  }

  function refresh() {
    try {
      ensureStyle();
      if (!enabled) {
        clearMarks();
        return;
      }
      if (!document.body) return;
      var existing = document.querySelector("[" + MARK + "]");
      if (existing) return;
      clearMarks();
      var el = findSessionLogControl();
      if (el) el.setAttribute(MARK, "1");
    } catch (e) {}
    reportAvailability();
  }

  function setEnabled(next) {
    enabled = !!next;
    refresh();
  }

  function proxyClick() {
    try {
      var el = findSessionLogControl();
      if (!el) return;
      var wasMarked = el.hasAttribute(MARK);
      if (wasMarked) el.removeAttribute(MARK);
      el.click();
      if (wasMarked && enabled) el.setAttribute(MARK, "1");
    } catch (e) {}
  }

  function looksLikeSessionExportDialog(text) {
    if (!text || text.length > 400) return false;
    if (!/session/i.test(text)) return false;
    return (
      text.indexOf("导出") >= 0 ||
      text.indexOf("export") >= 0 ||
      text.indexOf("ZIP") >= 0 ||
      text.indexOf("zip") >= 0 ||
      text.indexOf("下载") >= 0 ||
      text.indexOf("download") >= 0
    );
  }

  function clickDialogDismiss(dialog) {
    var buttons = dialog.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var label = textOf(buttons[i]);
      if (label === "关闭" || label === "Close") {
        buttons[i].click();
        return true;
      }
    }
    var iconClose = dialog.querySelector(
      "button[aria-label='关闭'], button[aria-label='Close']",
    );
    if (iconClose) {
      iconClose.click();
      return true;
    }
    return false;
  }

  function dismissSessionExportDialog() {
    try {
      var seen = [];
      function tryDismiss(dlg) {
        if (!dlg || seen.indexOf(dlg) >= 0) return false;
        seen.push(dlg);
        if (!dlg.getBoundingClientRect) return false;
        var r = dlg.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) return false;
        if (!looksLikeSessionExportDialog(textOf(dlg))) return false;
        return clickDialogDismiss(dlg);
      }
      var roots = document.querySelectorAll(
        "[role='dialog'], [role='alertdialog']",
      );
      for (var i = 0; i < roots.length; i++) {
        if (tryDismiss(roots[i])) return;
      }
      var modals = document.querySelectorAll("div[class*='dialog']");
      for (var j = 0; j < modals.length; j++) {
        if (tryDismiss(modals[j])) return;
      }
    } catch (e) {}
  }

  function hookNavigation() {
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      resetAvailability();
      return origPush.apply(this, arguments);
    };
    history.replaceState = function () {
      resetAvailability();
      return origReplace.apply(this, arguments);
    };
    global.addEventListener("popstate", resetAvailability);
  }

  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.sessionLog = {
    setEnabled: setEnabled,
    proxyClick: proxyClick,
    dismissSessionExportDialog: dismissSessionExportDialog,
    refresh: refresh,
    reportAvailability: reportAvailability,
    hookNavigation: hookNavigation,
  };
})(typeof window !== "undefined" ? window : globalThis);
