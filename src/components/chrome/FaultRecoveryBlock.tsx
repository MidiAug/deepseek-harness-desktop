import { useLocale } from "../../shell/locale";
import {
  CTA_LABEL_KEYS,
  getRecoveryPlan,
  type FaultCta,
} from "../../shell/errors/recoveryMatrix";

type Props = {
  error: string;
  onCta: (cta: FaultCta) => void;
};

/** Boot / 设置共用：按 HostError 前缀展示说明与恢复 CTA。 */
export function FaultRecoveryBlock({ error, onCta }: Props) {
  const { t } = useLocale();
  const recovery = getRecoveryPlan(error);

  return (
    <div className="fault-block">
      <h2 className="fault-title">{t(recovery.titleKey)}</h2>
      <p className="fault-body">{t(recovery.bodyKey)}</p>
      <pre className="fault-technical" aria-label={t("boot.technicalDetails")}>
        {error}
      </pre>
      <p className="fault-actions">
        <button
          type="button"
          className="btn"
          onClick={() => onCta(recovery.primary)}
        >
          {t(CTA_LABEL_KEYS[recovery.primary])}
        </button>
        {recovery.secondary.map((cta) => (
          <button
            key={cta}
            type="button"
            className="btn ghost"
            onClick={() => onCta(cta)}
          >
            {t(CTA_LABEL_KEYS[cta])}
          </button>
        ))}
      </p>
    </div>
  );
}
