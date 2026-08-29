/** iframe onLoad 后 Rust 探活，成功才进入 ready */

import { useCallback, useEffect, useRef } from "react";
import { probeHarnessUrl } from "../api/shellApi";
import { stripShellCacheParams } from "../harnessUrl";
import { shellLog } from "../logger";

const PROBE_INTERVAL_MS = 500;
const PROBE_TIMEOUT_MS = 15_000;

export function useHarnessIframeHealth(opts: {
  active: boolean;
  serviceUrl: string | null;
  iframeKey: number;
  onConnected: () => void;
  onFailed: () => void;
}) {
  const { active, serviceUrl, iframeKey, onConnected, onFailed } = opts;
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
  }, [iframeKey]);

  const runProbe = useCallback(async () => {
    if (!active || !serviceUrl) return;
    const gen = generationRef.current;
    const baseUrl = stripShellCacheParams(serviceUrl);
    const deadline = Date.now() + PROBE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      if (generationRef.current !== gen) return;
      try {
        const ok = await probeHarnessUrl(baseUrl);
        if (ok) {
          if (generationRef.current !== gen) return;
          shellLog.info("session", "iframe health probe ok", { url: baseUrl });
          onConnected();
          return;
        }
      } catch (e) {
        shellLog.warn("session", "iframe health probe error", {
          error: String(e),
        });
      }
      await new Promise((r) => window.setTimeout(r, PROBE_INTERVAL_MS));
    }

    if (generationRef.current === gen) {
      shellLog.op("boot.failed", { reason: "HEALTH_TIMEOUT" }, "err");
      onFailed();
    }
  }, [active, serviceUrl, onConnected, onFailed]);

  const onIframeLoad = useCallback(() => {
    if (!active || !serviceUrl) return;
    void runProbe();
  }, [active, serviceUrl, runProbe]);

  return { onIframeLoad };
}
