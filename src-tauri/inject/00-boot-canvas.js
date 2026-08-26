// B49+ — iframe 首帧底色：DSH React/CSS 就绪前避免白底透出（仅 loopback 子帧）
(function (global) {
  try {
    if (global === global.top) return;
    var host = global.location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }

  var DARK = "rgb(21, 21, 23)";
  var LIGHT = "rgb(245, 245, 247)";
  var canvas = DARK;

  try {
    var params = new URLSearchParams(global.location.search || "");
    var hint = params.get("shellCanvas");
    if (hint === "light") canvas = LIGHT;
    else if (hint === "dark") canvas = DARK;
    else if (
      global.matchMedia &&
      global.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      canvas = LIGHT;
    }
  } catch (e2) {
    /* keep dark default */
  }

  var scheme = canvas === LIGHT ? "light" : "dark";
  try {
    var el = global.document.documentElement;
    el.style.background = canvas;
    el.style.colorScheme = scheme;
    var style = global.document.createElement("style");
    style.id = "dsh-shell-boot-canvas";
    style.textContent =
      "html,body{background:" +
      canvas +
      "!important;color-scheme:" +
      scheme +
      ";}";
    var head = global.document.head || el;
    head.appendChild(style);
  } catch (e3) {
    /* ignore */
  }
})(typeof window !== "undefined" ? window : globalThis);
