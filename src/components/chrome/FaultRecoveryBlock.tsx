import { ShellTooltip } from "./ShellTooltip";
import { useLocale, type LocaleKey } from "../../shell/locale";
import {
  CTA_DESC_KEYS,
  CTA_LABEL_KEYS,
  parseFaultDisplay,
  reinstallCtaDescKey,
  type FaultCta,
} from "../../shell/errors";
import type { InstallMode } from "../../shell/runtime/installMode";

type Props = {
  error: string;
  installMode: InstallMode;
  onCta: (cta: FaultCta) => void;
};

function ctaDesc(
  cta: FaultCta,
  installMode: InstallMode,
  t: (key: LocaleKey) => string,
): string {
  if (cta === "reinstallDsh") return t(reinstallCtaDescKey(installMode));
  return t(CTA_DESC_KEYS[cta]);
}

/** Boot / 设置共用：标题 + 根因 + 简按钮（悬浮说明）。 */
export function FaultRecoveryBlock({ error, installMode, onCta }: Props) {
  const { t } = useLocale();
  const { plan, detail, actions } = parseFaultDisplay(error);

  return (
    <article className="fault-block">
      <h2 className="fault-title">{t(plan.titleKey)}</h2>
      <pre className="fault-detail" aria-label={t("boot.technicalDetails")}>
        {detail}
      </pre>
      <div className="fault-actions">
        {actions.map((cta, i) => (
          <ShellTooltip key={cta} label={ctaDesc(cta, installMode, t)}>
            <button
              type="button"
              className={i === 0 ? "btn" : "btn ghost"}
              onClick={() => onCta(cta)}
            >
              {t(CTA_LABEL_KEYS[cta])}
            </button>
          </ShellTooltip>
        ))}
      </div>
    </article>
  );
}
