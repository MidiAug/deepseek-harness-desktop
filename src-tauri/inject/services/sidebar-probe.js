// B49 — sidebar width probe service
(function (global) {
  if (!global.__dshShellGuardOk) return;

  var sel = global.__dshShell.selectors;
  var dom = global.__dshShell.dom;

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
        Math.round(global.innerWidth),
    };
  }

  function isSidebarLike(r, vw, vh) {
    if (!r || r.width < 8) return false;
    if (r.left > 12) return false;
    if (r.height < vh * 0.4) return false;
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
        break;
      }
      el = el.parentElement;
    }
    return best;
  }

  function findByNewChat(vw, vh) {
    var slotSidebar = dom.queryFirst(sel.sidebarCandidates);
    if (slotSidebar && isSidebarLike(slotSidebar.getBoundingClientRect(), vw, vh)) {
      return slotSidebar;
    }
    var nodes = document.querySelectorAll("button, a, div, span");
    var hit = null;
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
      if (t.indexOf("新会话") >= 0 && t.length < 24) {
        hit = nodes[i];
        break;
      }
    }
    if (!hit) return null;
    return climbFrom(hit, vw, vh);
  }

  function findCollapsedRail(vw, vh) {
    var all = document.querySelectorAll("div, aside, nav, section");
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var r = el.getBoundingClientRect();
      if (r.left > 4 || r.top > 80) continue;
      if (r.height < vh * 0.5) continue;
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
    var vw = global.innerWidth || document.documentElement.clientWidth || 0;
    var vh = global.innerHeight || document.documentElement.clientHeight || 0;
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
      detail: "inject: 未找到侧栏/折叠轨 · vw=" + Math.round(vw),
    };
  }

  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.sidebarProbe = {
    findSidebarWidth: findSidebarWidth,
  };
})(typeof window !== "undefined" ? window : globalThis);
