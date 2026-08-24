import { useLocale, type LocaleKey } from "../../shell/locale";
import {
  CTA_DESC_KEYS,
  CTA_LABEL_KEYS,
  parseFaultDisplay,
  reinstallCtaDescKey,
  type FaultCta,
} from "../../shell/errors";
import type { InstallMode } from "../../shell/runtime/installMode";
import { ShellTooltip } from "../chrome/ShellTooltip";

type Props = {
  error: string;
  installMode: InstallMode;
  secondaryActions: FaultCta[];
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

/** 更新行内联说明：与 settings-cell-desc 同层，无额外卡片。 */
export function SettingsUpdateNotice({
  error,
  installMode,
  secondaryActions,
  onCta,
}: Props) {
  const { t } = useLocale();
  const { detail } = parseFaultDisplay(error);

  return (
    <div className="settings-update-aside" role="alert">
      <p className="settings-update-aside-text">{detail}</p>
      {secondaryActions.length > 0 ? (
        <div className="settings-update-aside-links">
          {secondaryActions.map((cta) => (
            <ShellTooltip key={cta} label={ctaDesc(cta, installMode, t)}>
              <button
                type="button"
                className="settings-link-btn"
                onClick={() => onCta(cta)}
              >
                {t(CTA_LABEL_KEYS[cta])}
              </button>
            </ShellTooltip>
          ))}
        </div>
      ) : null}
    </div>
  );
}
