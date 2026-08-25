import type { RefObject } from "react";
import type { useLocale } from "../../shell/locale";

type TFn = ReturnType<typeof useLocale>["t"];

type Props = {
  logOpen: boolean;
  setLogOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  logLines: string[];
  logBodyRef: RefObject<HTMLDivElement | null>;
  t: TFn;
};

export function BootPanelLog({
  logOpen,
  setLogOpen,
  logLines,
  logBodyRef,
  t,
}: Props) {
  return (
    <section className="boot-log">
      <button
        type="button"
        className="boot-log-toggle"
        aria-expanded={logOpen}
        onClick={() => setLogOpen((v) => !v)}
      >
        <span className="boot-log-title">{t("boot.log.title")}</span>
        <span className="boot-log-meta">
          {t("boot.log.lineCount", { n: String(logLines.length) })}
          {logOpen ? t("boot.log.collapse") : t("boot.log.expand")}
        </span>
      </button>
      {logOpen && (
        <div
          ref={logBodyRef}
          className="boot-log-body"
          aria-label={t("boot.log.title")}
        >
          {logLines.length === 0 ? (
            <div className="boot-log-empty">{t("boot.log.wait")}</div>
          ) : (
            logLines.map((line, i) => (
              <div
                key={`${i}-${line.slice(0, 20)}`}
                className="boot-log-line"
              >
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
