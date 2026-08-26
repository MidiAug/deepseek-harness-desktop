// B49 — loopback iframe guard (run once)
(function (global) {
  try {
    if (global === global.top) return;
    var host = global.location.hostname;
    if (host !== "127.0.0.1" && host !== "localhost") return;
  } catch (e) {
    return;
  }
  global.__dshShellGuardOk = true;
})(typeof window !== "undefined" ? window : globalThis);
