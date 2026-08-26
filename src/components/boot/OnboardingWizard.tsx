import { useOnboardingWizard } from "../../shell/hooks/useOnboardingWizard";
import { OnboardingPathWarn } from "./OnboardingPathWarn";
import { OnboardingStepMode } from "./onboarding/OnboardingStepMode";
import { OnboardingStepPaths } from "./onboarding/OnboardingStepPaths";

type Props = {
  onComplete: () => void;
};

export function OnboardingWizard({ onComplete }: Props) {
  const w = useOnboardingWizard(onComplete);

  if (w.loadError && !w.probe) {
    return (
      <div className="boot-panel onboarding-panel" role="dialog" aria-modal="true">
        <div className="boot-shell onboarding-shell">
          <div className="boot-card onboarding-card">
            <p className="boot-lead">{w.loadError}</p>
            <button type="button" className="btn" onClick={() => void w.onConfirm()}>
              {w.t("onboarding.continueDefault")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!w.probe) {
    return (
      <div className="boot-panel onboarding-panel" role="dialog" aria-modal="true">
        <div className="boot-shell onboarding-shell">
          <div className="boot-card onboarding-card onboarding-card--loading">
            <p className="boot-lead onboarding-loading-lead">{w.t("onboarding.loading")}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="boot-panel onboarding-panel" role="dialog" aria-modal="true">
      <div className="boot-shell onboarding-shell">
        <div className="boot-card onboarding-card">
          <header className="onboarding-header">
            <h1 className="boot-title">{w.t("onboarding.title")}</h1>
            <p className="onboarding-lead">{w.lead}</p>
            {w.showAppDataWarn && w.probe.appDataConflictPath ? (
              <OnboardingPathWarn
                conflictPath={w.probe.appDataConflictPath}
                resolvedPath={w.probe.appDataDir}
                messageKey={
                  w.probe.appDataOccupied
                    ? "onboarding.appData.warnOccupied"
                    : "onboarding.appData.warnAutoAdjusted"
                }
              />
            ) : null}
          </header>

          <OnboardingStepMode
            probe={w.probe}
            choice={w.choice}
            t={w.t}
            onLocal={() => w.enterLocalChoice(w.probe!)}
            onHosted={() => w.enterHostedChoice(w.probe!)}
          />

          <OnboardingStepPaths
            probe={w.probe}
            choice={w.choice}
            dataMode={w.dataMode}
            dshHome={w.dshHome}
            setDshHome={w.setDshHome}
            dshHomeDisplay={w.dshHomeDisplay}
            pathLocked={w.pathLocked}
            busy={w.busy}
            pathOccupied={w.pathOccupied}
            pathHint={w.pathHint}
            showPathFeedback={w.showPathFeedback}
            showHostedDshWarn={w.showHostedDshWarn}
            activeDshHomeWarning={w.activeDshHomeWarning}
            t={w.t}
            setPathFocused={w.setPathFocused}
            setPathOccupied={w.setPathOccupied}
            setDshHomeWarning={w.setDshHomeWarning}
            onResetDshHome={w.onResetDshHome}
            onBrowseDshHome={() => void w.onBrowseDshHome()}
            applyHostedUserPath={w.applyHostedUserPath}
            enterHostedReusePath={w.enterHostedReusePath}
            enterLocalReusePath={w.enterLocalReusePath}
            enterHostedNewPath={w.enterHostedNewPath}
            enterLocalNewPath={w.enterLocalNewPath}
          />

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn primary"
              disabled={w.busy || w.pathOccupied}
              onClick={() => void w.onConfirm()}
            >
              {w.busy ? w.t("onboarding.saving") : w.t("onboarding.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
