//! 临时实验：Windows WebView 会把 init script 注入子 frame，
//! 在 iframe（127.0.0.1）内量侧栏宽，再 postMessage 回壳。
//! 实验结束可整文件删除。

/// 仅在子 frame + loopback 上跑。
/// 启发式：从「新会话」向上爬，取仍像侧栏的最外层（宽 < 视口 38% 且 < 420），
/// 避免爬到整页 layout（曾误报 ~窗口宽）。
pub const INIT_SCRIPT: &str = r#"
(function () {
  try {
    if (window === window.top) return;
    var host = location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }

  function describe(el, widthPx, state) {
    var cls =
      typeof el.className === "string" ? el.className.slice(0, 48) : "";
    var r = el.getBoundingClientRect();
    return {
      ok: true,
      widthPx: widthPx,
      collapsed: state === "collapsed",
      detail:
        "inject · " +
        state +
        " · " +
        el.tagName.toLowerCase() +
        (cls ? "." + cls : "") +
        " · left=" +
        Math.round(r.left) +
        " · vw=" +
        Math.round(window.innerWidth)
    };
  }

  function isSidebarLike(r, vw, vh) {
    if (!r || r.width < 8) return false;
    if (r.left > 12) return false;
    if (r.height < vh * 0.4) return false;
    // 硬上限：绝不能接近整窗宽
    if (r.width > Math.min(420, vw * 0.38)) return false;
    return true;
  }

  function climbFrom(hit, vw, vh) {
    var best = null;
    var el = hit;
    while (el && el !== document.body && el !== document.documentElement) {
      var r = el.getBoundingClientRect();
      if (isSidebarLike(r, vw, vh)) {
        best = el;
      } else if (best && r.width > Math.min(420, vw * 0.38)) {
        // 再往上已是主区/整页，停
        break;
      }
      el = el.parentElement;
    }
    return best;
  }

  function findByNewChat(vw, vh) {
    var nodes = document.querySelectorAll("button, a, div, span");
    var hit = null;
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      // 避免整页大块文本误命中：只要较短标签含「新会话」
      if (t.indexOf("新会话") >= 0 && t.length < 24) {
        hit = nodes[i];
        break;
      }
    }
    if (!hit) return null;
    return climbFrom(hit, vw, vh);
  }

  /** 折叠态：左侧窄轨（图标栏），无「新会话」长文案 */
  function findCollapsedRail(vw, vh) {
    var all = document.querySelectorAll("div, aside, nav, section");
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.left > 4 || r.top > 80) continue;
      if (r.height < vh * 0.5) continue;
      // 折叠轨通常 ~48–88px
      if (r.width < 36 || r.width > 96) continue;
      if (r.width > vw * 0.2) continue;
      var score = r.height - Math.abs(r.width - 56);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function findSidebarWidth() {
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;

    var expanded = findByNewChat(vw, vh);
    if (expanded) {
      var er = expanded.getBoundingClientRect();
      return describe(expanded, Math.round(er.width), "expanded");
    }

    var rail = findCollapsedRail(vw, vh);
    if (rail) {
      var rr = rail.getBoundingClientRect();
      return describe(rail, Math.round(rr.width), "collapsed");
    }

    return {
      ok: false,
      widthPx: null,
      collapsed: null,
      detail: "inject: 未找到侧栏/折叠轨 · vw=" + Math.round(vw)
    };
  }

  function report(force) {
    try {
      var payload = findSidebarWidth();
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
      window.parent.postMessage(payload, "*");
    } catch (err) {
      window.parent.postMessage(
        {
          source: "dsh-shell-sidebar-probe",
          method: "webview-init-inject",
          ok: false,
          widthPx: null,
          detail: "inject error: " + String(err)
        },
        "*"
      );
    }
  }

  var lastSent = { w: null, c: null, t: 0 };
  var pendingTimer = null;
  var resizeTimer = null;

  // 慢轮询兜底折叠；resize 节流 150ms，且同宽不重复 postMessage
  setInterval(function () {
    report(false);
  }, 1000);
  window.addEventListener("resize", function () {
    if (resizeTimer != null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      report(false);
    }, 150);
  });
  if (document.readyState === "complete") report(true);
  else window.addEventListener("load", function () {
    report(true);
  });
})();
"#;
