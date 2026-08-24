import { useCallback, useEffect, useState } from "react";
import { IconFolderOpenOutline16, IconRefreshOutline16 } from "../chrome/DshIcons";
import { OnboardingPathIconBtn } from "./OnboardingPathIconBtn";
import { OnboardingPathWarn } from "./OnboardingPathWarn";
import { ShellProgressBubble } from "../chrome/ShellProgressBubble";
import {
  shellApi,
  shellLog,
  useLocale,
  type EnvironmentProbe,
  runtimeFromSettings,
  normalizeShellSettings,
} from "../../shell";
import { pathsEqual, shortenPathForDisplay } from "../../shell/formatPathShort";
import type { RuntimeSource } from "../../shell/settings";

type Props = {
  onComplete: () => void;
};

type Choice = "local" | "hosted";
type DataMode = "reuse" | "new";

type PathWarning = {
  conflictPath: string;
  resolvedPath: string;
};

function applyAutoResolve(
  resolved: {
    path: string;
    adjusted: boolean;
    conflictPath?: string | null;
  },
  setPath: (p: string) => void,
  setWarning: (w: PathWarning | null) => void,
) {
  setPath(resolved.path);
  if (resolved.adjusted && resolved.conflictPath) {
    setWarning({
      conflictPath: resolved.conflictPath,
      resolvedPath: resolved.path,
    });
  } else {
    setWarning(null);
  }
}

/** hosted 模式「复用已有」：优先本应用 dsh-home，其次 ~/.dsh，否则默认托管槽位。 */
function hostedReusePath(probe: EnvironmentProbe): string {
  const reuse = probe.hostedDshHomeReusePath?.trim();
  if (reuse) return reuse;
  if (probe.dshHomeDetected) return probe.dshHomeDefault;
  return probe.hostedDshHomeDefault;
}

function shouldDefaultHostedReuse(probe: EnvironmentProbe): boolean {
  return probe.dshHomeDetected || probe.hostedDshHomeReuseAvailable;
}

function probeDshHomeWarning(probe: EnvironmentProbe): PathWarning | null {
  if (!probe.hostedDshHomeAdjusted || !probe.hostedDshHomeConflictPath) {
    return null;
  }
  return {
    conflictPath: probe.hostedDshHomeConflictPath,
    resolvedPath: probe.hostedDshHomeDefault,
  };
}

function activeDshHomeWarningForPath(
  probe: EnvironmentProbe,
  dshHome: string,
  stored: PathWarning | null,
): PathWarning | null {
  if (stored && pathsEqual(dshHome, stored.resolvedPath)) {
    return stored;
  }
  const fromProbe = probeDshHomeWarning(probe);
  if (fromProbe && pathsEqual(dshHome, probe.hostedDshHomeDefault)) {
    return fromProbe;
  }
  return null;
}

function atHostedNewDefaultPath(probe: EnvironmentProbe, dshHome: string): boolean {
  return pathsEqual(dshHome, probe.hostedDshHomeDefault);
}

export function OnboardingWizard({ onComplete }: Props) {
  const { t } = useLocale();
  const [probe, setProbe] = useState<EnvironmentProbe | null>(null);
  const [choice, setChoice] = useState<Choice>("local");
  const [dataMode, setDataMode] = useState<DataMode>("new");
  const [dshHome, setDshHome] = useState("");
  const [dshHomeWarning, setDshHomeWarning] = useState<PathWarning | null>(null);
  const [pathOccupied, setPathOccupied] = useState(false);
  const [pathFocused, setPathFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const enterHostedNewPath = useCallback((p: EnvironmentProbe) => {
    setDataMode("new");
    setPathOccupied(false);
    applyAutoResolve(
      {
        path: p.hostedDshHomeDefault,
        adjusted: p.hostedDshHomeAdjusted,
        conflictPath: p.hostedDshHomeConflictPath,
      },
      setDshHome,
      setDshHomeWarning,
    );
  }, []);

  const enterLocalReusePath = useCallback((p: EnvironmentProbe) => {
    setDataMode("reuse");
    setPathOccupied(false);
    setDshHomeWarning(null);
    setDshHome(p.dshHomeDefault);
  }, []);

  const enterLocalNewPath = useCallback((p: EnvironmentProbe) => {
    setDataMode("new");
    setPathOccupied(false);
    setDshHomeWarning(null);
    setDshHome(p.dshHomeDefault);
  }, []);

  const enterHostedReusePath = useCallback((p: EnvironmentProbe) => {
    setDataMode("reuse");
    setPathOccupied(false);
    setDshHomeWarning(null);
    setDshHome(hostedReusePath(p));
  }, []);

  const enterHostedChoice = useCallback(
    (p: EnvironmentProbe) => {
      setChoice("hosted");
      if (shouldDefaultHostedReuse(p)) {
        enterHostedReusePath(p);
        return;
      }
      enterHostedNewPath(p);
    },
    [enterHostedNewPath, enterHostedReusePath],
  );

  const enterLocalChoice = useCallback(
    (p: EnvironmentProbe) => {
      setChoice("local");
      if (p.dshHomeDetected) {
        enterLocalReusePath(p);
        return;
      }
      enterLocalNewPath(p);
    },
    [enterLocalNewPath, enterLocalReusePath],
  );

  const applyHostedUserPath = useCallback(
    async (rawPath: string) => {
      const trimmed = rawPath.trim();
      if (!trimmed || !probe) return;
      setDshHome(trimmed);

      if (
        (probe.appDataConflictPath &&
          pathsEqual(trimmed, probe.appDataConflictPath)) ||
        (probe.hostedDshHomeConflictPath &&
          pathsEqual(trimmed, probe.hostedDshHomeConflictPath))
      ) {
        setPathOccupied(true);
        setDshHomeWarning(null);
        return;
      }

      if (pathsEqual(trimmed, probe.hostedDshHomeDefault)) {
        setPathOccupied(false);
        setDshHomeWarning(probeDshHomeWarning(probe));
        return;
      }

      if (pathsEqual(trimmed, probe.appDataDir)) {
        setPathOccupied(false);
        return;
      }

      try {
        const result = await shellApi.resolveDshHomePath(trimmed, "hosted", false);
        if (result.occupied) {
          setPathOccupied(true);
          setDshHomeWarning(null);
          return;
        }
        setPathOccupied(false);
        setDshHomeWarning(null);
        setDshHome(result.path);
      } catch (e) {
        shellLog.error("onboarding", "applyHostedUserPath", e);
      }
    },
    [probe],
  );

  const onResetDshHome = useCallback(() => {
    if (!probe) return;
    setPathOccupied(false);
    if (choice === "hosted") {
      if (dataMode === "reuse") {
        enterHostedReusePath(probe);
        return;
      }
      enterHostedNewPath(probe);
      return;
    }
    if (dataMode === "reuse") {
      enterLocalReusePath(probe);
      return;
    }
    enterLocalNewPath(probe);
  }, [
    choice,
    dataMode,
    enterHostedNewPath,
    enterHostedReusePath,
    enterLocalNewPath,
    enterLocalReusePath,
    probe,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const p = await shellApi.probeEnvironment();
        if (cancelled) return;
        setProbe(p);
        const preferLocal = p.systemRuntimeDetected;
        if (preferLocal) {
          enterLocalChoice(p);
        } else {
          enterHostedChoice(p);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e));
          shellLog.error("onboarding", "probe", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enterHostedChoice, enterLocalChoice]);

  const onBrowseDshHome = useCallback(async () => {
    if (dataMode === "reuse") return;
    try {
      const picked = await shellApi.pickDirectory(dshHome || probe?.dshHomeDefault);
      if (!picked) return;
      if (choice === "local") {
        setDshHome(picked);
        setPathOccupied(false);
        return;
      }
      await applyHostedUserPath(picked);
    } catch (e) {
      shellLog.error("onboarding", "pickDirectory", e);
    }
  }, [
    applyHostedUserPath,
    choice,
    dataMode,
    dshHome,
    probe?.dshHomeDefault,
  ]);

  const onConfirm = useCallback(async () => {
    if (busy || pathOccupied) return;
    setBusy(true);
    try {
      const pathForSave =
        dataMode === "reuse" && probe
          ? choice === "hosted"
            ? hostedReusePath(probe)
            : probe.dshHomeDefault
          : dshHome.trim();
      const resolved = await shellApi.resolveDshHomePath(
        pathForSave,
        choice,
        dataMode === "new",
      );
      if (resolved.occupied) {
        setPathOccupied(true);
        return;
      }
      applyAutoResolve(resolved, setDshHome, setDshHomeWarning);
      const settings = normalizeShellSettings(await shellApi.getShellSettings());
      const runtimeSource: RuntimeSource =
        choice === "local" ? "auto" : "hosted";
      await shellApi.saveRuntimeSettings({
        ...runtimeFromSettings(settings),
        runtimeSource,
        dshHomeOverride: resolved.path.trim(),
        onboardingDone: true,
      });
      onComplete();
    } catch (e) {
      shellLog.error("onboarding", "save", e);
      setLoadError(String(e));
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    choice,
    dataMode,
    dshHome,
    onComplete,
    pathOccupied,
    probe,
    t,
  ]);

  const pathLocked = dataMode === "reuse";

  const pathHint =
    dataMode === "reuse"
      ? t("onboarding.dshHome.hintReuse")
      : t("onboarding.dshHome.hintNew");

  const activeDshHomeWarning =
    probe && choice === "hosted" && dataMode === "new"
      ? activeDshHomeWarningForPath(probe, dshHome, dshHomeWarning)
      : null;

  const showHostedAppDataWarn =
    choice === "hosted" &&
    dataMode === "new" &&
    !pathOccupied &&
    !!probe?.appDataAdjusted &&
    !!probe.appDataConflictPath &&
    !!probe &&
    atHostedNewDefaultPath(probe, dshHome);
  const showHostedDshWarn =
    choice === "hosted" &&
    dataMode === "new" &&
    !pathOccupied &&
    !!activeDshHomeWarning;
  const dshHomeDisplay =
    pathFocused && !pathLocked
      ? dshHome
      : shortenPathForDisplay(dshHome);

  const showPathFeedback =
    pathOccupied ||
    showHostedAppDataWarn ||
    showHostedDshWarn ||
    !!pathHint;

  if (loadError && !probe) {
    return (
      <div className="boot-panel onboarding-panel" role="dialog" aria-modal="true">
        <div className="boot-shell onboarding-shell">
          <div className="boot-card onboarding-card">
            <p className="boot-lead">{loadError}</p>
            <button type="button" className="btn" onClick={() => void onConfirm()}>
              {t("onboarding.continueDefault")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!probe) {
    return <ShellProgressBubble message={t("onboarding.loading")} />;
  }

  const lead = probe.systemRuntimeDetected
    ? t("onboarding.lead.detected")
    : t("onboarding.lead.fresh");

  return (
    <div className="boot-panel onboarding-panel" role="dialog" aria-modal="true">
      <div className="boot-shell onboarding-shell">
        <div className="boot-card onboarding-card">
          <header className="onboarding-header">
            <h1 className="boot-title">{t("onboarding.title")}</h1>
            <p className="onboarding-lead">{lead}</p>
          </header>

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
                onChange={() => enterLocalChoice(probe)}
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
                onChange={() => enterHostedChoice(probe)}
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
                    onClick={() => void onBrowseDshHome()}
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

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || pathOccupied}
              onClick={() => void onConfirm()}
            >
              {busy ? t("onboarding.saving") : t("onboarding.confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
