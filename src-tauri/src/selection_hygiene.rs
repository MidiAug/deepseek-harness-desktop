//! Harness iframe（loopback）选择洁净：侧栏/品牌/模式与输入区工具下拉不可拖选；
//! 输入框与对话正文可复制。默认关；postMessage：`selection-hygiene`。
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

  var STYLE_ID = "dsh-shell-selection-hygiene";
  var SLOGANS = ["探索未至之境"];
  // 侧栏标题
  var SIDE_LABELS = ["工作区"];
  // 会话顶栏模式、输入区权限等下拉标签（禁拖选，仍可点击）
  var CHROME_LABELS = [
    "标准模式",
    "Workspace Write",
    "Read Only",
    "只读",
    "Workspace Read",
    "Ask"
  ];
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
    // 仅标记节点；不全局禁 button/a，避免伤聊天 Think/工具行
    style.textContent = [
      "[data-dsh-shell-no-select], [data-dsh-shell-no-select] * {",
      "  -webkit-user-select: none !important;",
      "  user-select: none !important;",
      "}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function clearMarks() {
    var nodes = document.querySelectorAll("[data-dsh-shell-no-select]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute("data-dsh-shell-no-select");
    }
  }

  function markEl(el, depthMax) {
    var cur = el;
    var d = 0;
    while (cur && d < depthMax) {
      cur.setAttribute("data-dsh-shell-no-select", "1");
      cur = cur.parentElement;
      d++;
    }
  }

  function isEditableContext(el) {
    if (!el || !el.closest) return false;
    return !!el.closest(
      "textarea, input, [contenteditable='true'], [contenteditable='']"
    );
  }

  function isInLeftChrome(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth || 800;
    if (r.left < 8 && r.width < Math.min(420, vw * 0.42)) return true;
    if (el.closest("aside, nav")) return true;
    return false;
  }

  function markSidebars() {
    var cands = document.querySelectorAll(
      "aside, nav, [class*='sidebar'], [class*='Sidebar'], [class*='side-bar']"
    );
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var r = el.getBoundingClientRect();
      var vw = window.innerWidth || 800;
      if (r.width < 8) continue;
      if (r.width > Math.min(480, vw * 0.45)) continue;
      if (r.left > 24) continue;
      el.setAttribute("data-dsh-shell-no-select", "1");
    }
  }

  function labelMatch(t, list, maxLen) {
    for (var i = 0; i < list.length; i++) {
      var L = list[i];
      if (t === L) return true;
      if (t.indexOf(L) >= 0 && t.length < maxLen) return true;
    }
    return false;
  }

  function markByLabels() {
    var walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_TEXT,
      null
    );
    var node;
    while ((node = walker.nextNode())) {
      var t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 48) continue;
      var el = node.parentElement;
      if (!el || isEditableContext(el)) continue;

      var hitSlogan = labelMatch(t, SLOGANS, 48);
      var hitSide = labelMatch(t, SIDE_LABELS, 16);
      var hitChrome = labelMatch(t, CHROME_LABELS, 28);

      if (hitSlogan) {
        markEl(el, 4);
        continue;
      }
      if (hitSide && isInLeftChrome(el)) {
        markEl(el, 5);
        continue;
      }
      // 模式 / 输入区工具下拉：点仍可用，拖选禁掉
      if (hitChrome) {
        markEl(el, 3);
      }
    }
  }

  function refresh() {
    try {
      if (!enabled) {
        clearMarks();
        ensureStyle();
        return;
      }
      clearMarks();
      ensureStyle();
      if (document.body) {
        markSidebars();
        markByLabels();
      }
    } catch (e) {}
  }

  function setEnabled(next) {
    enabled = !!next;
    refresh();
  }

  window.addEventListener("message", function (ev) {
    var d = ev && ev.data;
    if (!d || d.source !== "dsh-shell") return;
    if (d.type === "selection-hygiene") {
      setEnabled(d.enabled === true);
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
