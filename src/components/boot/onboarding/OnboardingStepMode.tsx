import type { EnvironmentProbe } from "../../../shell";
import type { OnboardingChoice } from "../../../shell/hooks/useOnboardingWizard";
import type { useLocale } from "../../../shell/locale";

type TFn = ReturnType<typeof useLocale>["t"];

type Props = {
  probe: EnvironmentProbe;
  choice: OnboardingChoice;
  t: TFn;
  onLocal: () => void;
  onHosted: () => void;
};

export function OnboardingStepMode({
  probe,
  choice,
  t,
  onLocal,
  onHosted,
}: Props) {
  return (
    <div className="onboarding-choices" role="radiogroup" aria-label={t("onboarding.title")}>
      <label
        className={`onboarding-choice${choice === "local" ? " selected" : ""}${!probe.systemRuntimeDetected ? " disabled" : ""}`}
      >
        <input
          type="radio"
          name="onboarding-choice"
          value="local"
          checked={choice === "local"}
          disabled={!probe.systemRuntimeDetected}
          onChange={onLocal}
        />
        <div className="onboarding-choice-head">
          <span className="onboarding-choice-title">
            {t("onboarding.choice.local.title")}
          </span>
          {probe.systemRuntimeDetected ? (
            <span className="onboarding-choice-tag">
              {t("onboarding.choice.local.tag")}
            </span>
          ) : (
            <span className="onboarding-choice-tag muted">
              {t("onboarding.choice.local.unavailable")}
            </span>
          )}
        </div>
        {probe.systemRuntimeDetected && (
          <div className="onboarding-choice-versions">
            {probe.harnessVersion && (
              <span className="onboarding-choice-detail mono shell-copyable">
                {t("onboarding.choice.local.versionDsh", {
                  version: probe.harnessVersion,
                })}
              </span>
            )}
            {probe.systemNodeVersion && (
              <span className="onboarding-choice-detail mono shell-copyable">
                {t("onboarding.choice.local.versionNode", {
                  version: probe.systemNodeVersion,
                })}
              </span>
            )}
          </div>
        )}
      </label>

      <label
        className={`onboarding-choice${choice === "hosted" ? " selected" : ""}`}
      >
        <input
          type="radio"
          name="onboarding-choice"
          value="hosted"
          checked={choice === "hosted"}
          onChange={onHosted}
        />
        <div className="onboarding-choice-head">
          <span className="onboarding-choice-title">
            {t("onboarding.choice.hosted.title")}
          </span>
          <span className="onboarding-choice-tag">
            {t("onboarding.choice.hosted.tag")}
          </span>
        </div>
      </label>
    </div>
  );
}
