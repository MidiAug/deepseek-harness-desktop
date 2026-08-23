//! Harness iframe：简洁模式下隐藏官方 Session log，并由壳顶栏 postMessage 代理点击。
//! 消息：`{ source: "dsh-shell", type: "session-log-proxy", enabled: bool }`
//! 点击：`{ source: "dsh-shell", type: "session-log-click" }`
//! 关窗：`{ source: "dsh-shell", type: "session-log-dismiss-dialog" }`
//! 上报：`{ source: "dsh-harness", type: "session-log-available", available: bool }`
//! best-effort；上游 DOM 大改可能失效。

pub const INIT_SCRIPT: &str = r#"
(function () {
  try {
    if (window === window.top) return;
    var host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }

  var STYLE_ID = "dsh-shell-session-log-proxy";
  var MARK = "data-dsh-shell-session-log-hidden";
  var enabled = false;
  var lastReported = null;
  var reportTrueTimer = null;
  var REPORT_TRUE_DELAY_MS = 280;

  function postAvailability(available) {
    try {
      window.parent.postMessage(
        {
          source: "dsh-harness",
          type: "session-log-available",
          available: available,
        },
        "*"
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
    window.addEventListener("popstate", resetAvailability);
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
    // 偏右上：避开侧栏等误命中
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 800;
    if (r.left < vw * 0.45) return false;
    if (r.top > 120) return false;
    return true;
  }

  function findSessionLogControl() {
    var marked = document.querySelector("[" + MARK + "]");
    if (marked) return marked;
    var cands = document.querySelectorAll(
      "button, a, [role='button'], div, span"
    );
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (!looksLikeSessionLog(el)) continue;
      var r = el.getBoundingClientRect();
      var area = Math.max(1, r.width * r.height);
      // 取面积较小的可点控件，避免整块 header
      if (area < bestArea && area < 20000) {
        bestArea = area;
        best = el;
      }
    }
    if (!best) return null;
    // 若自身不可点，向上找 button / role=button
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
      // 点击时临时解除隐藏，避免部分 UI 忽略 display:none 元素的 click
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
      "button[aria-label='关闭'], button[aria-label='Close']"
    );
    if (iconClose) {
      iconClose.click();
      return true;
    }
    return false;
  }

  /** Harness「Session 导出已开始下载」信息弹窗；下载完成后由壳代点「关闭」。 */
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
        "[role='dialog'], [role='alertdialog']"
      );
      for (var i = 0; i < roots.length; i++) {
        if (tryDismiss(roots[i])) return;
      }
      // DSH Modal 常为 CSS module class*=_dialog_
      var modals = document.querySelectorAll("div[class*='dialog']");
      for (var j = 0; j < modals.length; j++) {
        if (tryDismiss(modals[j])) return;
      }
    } catch (e) {}
  }

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type === "session-log-proxy") {
      setEnabled(d.enabled === true);
    } else if (d.type === "session-log-click") {
      proxyClick();
    } else if (d.type === "session-log-dismiss-dialog") {
      dismissSessionExportDialog();
    }
  });

  function boot() {
    hookNavigation();
    reportAvailability();
    var obs = new MutationObserver(function () {
      if (boot._t) clearTimeout(boot._t);
      boot._t = setTimeout(function () {
        refresh();
        reportAvailability();
      }, 160);
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
"#;
