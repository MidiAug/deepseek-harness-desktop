//! Harness iframe：简洁模式下隐藏官方 Session log，并由壳顶栏 postMessage 代理点击。
//! 消息：`{ source: "dsh-shell", type: "session-log-proxy", enabled: bool }`
//! 点击：`{ source: "dsh-shell", type: "session-log-click" }`
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

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type === "session-log-proxy") {
      setEnabled(d.enabled === true);
    } else if (d.type === "session-log-click") {
      proxyClick();
    }
  });

  function boot() {
    refresh();
    var obs = new MutationObserver(function () {
      if (!enabled) return;
      if (boot._t) clearTimeout(boot._t);
      boot._t = setTimeout(refresh, 160);
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
