import { IconFolderOpenOutline16, IconRefreshOutline16 } from "../../chrome/DshIcons";
import type { EnvironmentProbe } from "../../../shell";
import type {
  OnboardingChoice,
  OnboardingDataMode,
  PathWarning,
} from "../../../shell/hooks/useOnboardingWizard";
import type { useLocale } from "../../../shell/locale";
import { shortenPathForDisplay } from "../../../shell/formatPathShort";
import { OnboardingPathIconBtn } from "../OnboardingPathIconBtn";
import { OnboardingPathWarn } from "../OnboardingPathWarn";

type TFn = ReturnType<typeof useLocale>["t"];

type Props = {
  probe: EnvironmentProbe;
  choice: OnboardingChoice;
  dataMode: OnboardingDataMode;
  dshHome: string;
  setDshHome: (v: string) => void;
  dshHomeDisplay: string;
  pathLocked: boolean;
  busy: boolean;
  pathOccupied: boolean;
  pathHint: string;
  showPathFeedback: boolean;
  showHostedAppDataWarn: boolean;
  showHostedDshWarn: boolean;
  activeDshHomeWarning: PathWarning | null;
  t: TFn;
  setPathFocused: (v: boolean) => void;
  setPathOccupied: (v: boolean) => void;
  setDshHomeWarning: (w: PathWarning | null) => void;
  onResetDshHome: () => void;
  onBrowseDshHome: () => void;
  applyHostedUserPath: (path: string) => Promise<void>;
  enterHostedReusePath: (p: EnvironmentProbe) => void;
  enterLocalReusePath: (p: EnvironmentProbe) => void;
  enterHostedNewPath: (p: EnvironmentProbe) => void;
  enterLocalNewPath: (p: EnvironmentProbe) => void;
};

export function OnboardingStepPaths({
  probe,
  choice,
  dataMode,
  dshHome,
  setDshHome,
  dshHomeDisplay,
  pathLocked,
  busy,
  pathOccupied,
  pathHint,
  showPathFeedback,
  showHostedAppDataWarn,
  showHostedDshWarn,
  activeDshHomeWarning,
  t,
  setPathFocused,
  setPathOccupied,
  setDshHomeWarning,
  onResetDshHome,
  onBrowseDshHome,
  applyHostedUserPath,
  enterHostedReusePath,
  enterLocalReusePath,
  enterHostedNewPath,
  enterLocalNewPath,
}: Props) {
  return (
    <section className="onboarding-dsh-home" aria-labelledby="onboarding-dsh-home-title">
      <header className="onboarding-section-header">
        <div className="onboarding-section-head">
          <h2 id="onboarding-dsh-home-title" className="boot-title">
            {t("onboarding.dshHome.section")}
          </h2>
          <div
            className="onboarding-dsh-home-mode"
            role="group"
            aria-label={t("onboarding.dshHome.section")}
          >
            <button
              type="button"
              className={dataMode === "reuse" ? " on" : ""}
              aria-pressed={dataMode === "reuse"}
              onClick={() =>
                choice === "hosted"
                  ? enterHostedReusePath(probe)
                  : enterLocalReusePath(probe)
              }
            >
              {t("onboarding.dshHome.modeReuse")}
            </button>
            <button
              type="button"
              className={dataMode === "new" ? " on" : ""}
              aria-pressed={dataMode === "new"}
              onClick={() =>
                choice === "hosted"
                  ? enterHostedNewPath(probe)
                  : enterLocalNewPath(probe)
              }
            >
              {t("onboarding.dshHome.modeNew")}
            </button>
          </div>
        </div>
        <p className="onboarding-lead">{t("onboarding.dshHome.lead")}</p>
      </header>
      <div className="onboarding-dsh-home-panel">
        <div
          className={`onboarding-dsh-home-input-wrap${pathLocked ? " is-disabled" : ""}`}
        >
          <input
            className="mono shell-copyable onboarding-dsh-home-input"
            value={dshHomeDisplay}
            disabled={pathLocked || busy}
            readOnly={pathLocked}
            aria-labelledby="onboarding-dsh-home-title"
            onFocus={() => setPathFocused(true)}
            onChange={(e) => {
              setDshHome(e.target.value);
              setPathOccupied(false);
              setDshHomeWarning(null);
            }}
            onBlur={() => {
              setPathFocused(false);
              if (pathLocked) return;
              if (!dshHome.trim()) return;
              if (choice === "hosted") {
                void applyHostedUserPath(dshHome);
              }
            }}
            placeholder={shortenPathForDisplay(probe.dshHomeDefault)}
          />
          <div className="onboarding-dsh-home-actions">
            <OnboardingPathIconBtn
              label={t("onboarding.dshHome.reset")}
              disabled={busy || pathLocked}
              onClick={onResetDshHome}
            >
              <IconRefreshOutline16 size={16} />
            </OnboardingPathIconBtn>
            <OnboardingPathIconBtn
              label={t("onboarding.dshHome.browse")}
              disabled={busy || pathLocked}
              onClick={onBrowseDshHome}
            >
              <IconFolderOpenOutline16 size={16} />
            </OnboardingPathIconBtn>
          </div>
        </div>
        {showPathFeedback && (
          <div className="onboarding-dsh-home-meta" aria-live="polite">
            {pathOccupied ? (
              <OnboardingPathWarn
                tone="error"
                resolvedPath={dshHome}
                messageKey="onboarding.dshHome.errorNonempty"
              />
            ) : showHostedAppDataWarn && probe.appDataConflictPath ? (
              <OnboardingPathWarn
                conflictPath={probe.appDataConflictPath}
                resolvedPath={probe.appDataDir}
              />
            ) : showHostedDshWarn && activeDshHomeWarning ? (
              <OnboardingPathWarn
                conflictPath={activeDshHomeWarning.conflictPath}
                resolvedPath={activeDshHomeWarning.resolvedPath}
              />
            ) : pathHint ? (
              <p className="onboarding-path-note">{pathHint}</p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
