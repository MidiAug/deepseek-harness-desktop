/**
 * Harness iframe / 探活 URL 查询串整理。
 * 去掉壳侧缓存参数，保留上游启动令牌 `token`（B65 Host 认证）。
 */

const SHELL_CACHE_KEYS = new Set(["t", "shellcanvas"]);

/** 去掉 `t` / `shellCanvas`，保留其余 query（含 `token`）。 */
export function stripShellCacheParams(url: string): string {
  const q = url.indexOf("?");
  if (q < 0) return url;
  const base = url.slice(0, q);
  const search = url.slice(q + 1);
  const kept: string[] = [];
  for (const part of search.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const key = (eq >= 0 ? part.slice(0, eq) : part).toLowerCase();
    if (SHELL_CACHE_KEYS.has(key)) continue;
    kept.push(part);
  }
  return kept.length === 0 ? base : `${base}?${kept.join("&")}`;
}
