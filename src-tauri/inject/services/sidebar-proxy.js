// B49 — sidebar proxy — 触发 DSH 原生菜单项
(function (global) {
  if (!global.__dshShellGuardOk) return;
  var du = global.__dshShell.services.dom;

  var ACTION_LABELS = {
    rename: ["重命名", "Rename"],
    fork: ["分叉会话", "Fork conversation", "Fork"],
    archive: ["归档会话", "Archive conversation", "Archive"],
    delete: ["删除工作区", "Delete workspace", "Delete"],
  };

  function findEllipsisButton(row) {
    if (!row) return null;
    var buttons = row.querySelectorAll("button");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var popup = btn.getAttribute("aria-haspopup");
      if (popup === "menu" || popup === "true") return btn;
    }
    for (var j = 0; j < buttons.length; j++) {
      var label = buttons[j].getAttribute("aria-label") || "";
      if (label.indexOf("的操作") >= 0 || /actions?\s+for/i.test(label)) {
        return buttons[j];
      }
    }
    if (buttons.length === 1) return buttons[0];
    if (buttons.length > 1) return buttons[buttons.length - 1];
    return null;
  }

  function clickMenuItem(action) {
    var labels = ACTION_LABELS[action];
    if (!labels) return false;
    var menus = document.querySelectorAll('[role="menu"]');
    var menu = menus.length ? menus[menus.length - 1] : null;
    if (!menu) return false;
    var items = menu.querySelectorAll('[role="menuitem"]');
    for (var i = 0; i < items.length; i++) {
      if (du.labelMatches(items[i].textContent, labels)) {
        items[i].click();
        return true;
      }
    }
    return false;
  }

  function proxySidebarAction(row, action) {
    var ellipsis = findEllipsisButton(row);
    if (!ellipsis) return;
    ellipsis.click();
    var tries = 0;
    function attempt() {
      if (clickMenuItem(action)) return;
      tries += 1;
      if (tries < 8) setTimeout(attempt, 40);
    }
    setTimeout(attempt, 0);
  }

  global.__dshShell.services = global.__dshShell.services || {};
  global.__dshShell.services.sidebar = {
    proxyAction: proxySidebarAction,
  };
})(typeof window !== "undefined" ? window : globalThis);
