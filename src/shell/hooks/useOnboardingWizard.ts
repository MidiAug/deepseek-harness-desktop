import { useCallback, useEffect, useState } from "react";
import {
  shellApi,
  shellLog,
  useLocale,
  type EnvironmentProbe,
  runtimeFromSettings,
  normalizeShellSettings,
} from "../index";
import { pathsEqual, shortenPathForDisplay } from "../formatPathShort";
import type { RuntimeSource } from "../settings";

export type OnboardingChoice = "local" | "hosted";
export type OnboardingDataMode = "reuse" | "new";

export type PathWarning = {
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

export function useOnboardingWizard(onComplete: () => void) {
  const { t } = useLocale();
  const [probe, setProbe] = useState<EnvironmentProbe | null>(null);
  const [choice, setChoice] = useState<OnboardingChoice>("local");
  const [dataMode, setDataMode] = useState<OnboardingDataMode>("new");
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
        if (p.systemRuntimeDetected) {
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
  }, [applyHostedUserPath, choice, dataMode, dshHome, probe?.dshHomeDefault]);

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
        choice === "local" ? "system" : "hosted";
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
  }, [busy, choice, dataMode, dshHome, onComplete, pathOccupied, probe]);

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
    pathFocused && !pathLocked ? dshHome : shortenPathForDisplay(dshHome);
  const showPathFeedback =
    pathOccupied ||
    showHostedAppDataWarn ||
    showHostedDshWarn ||
    !!pathHint;

  const lead = probe
    ? probe.systemRuntimeDetected
      ? t("onboarding.lead.detected")
      : t("onboarding.lead.fresh")
    : "";

  return {
    t,
    probe,
    choice,
    dataMode,
    dshHome,
    setDshHome,
    pathOccupied,
    setPathOccupied,
    setDshHomeWarning,
    pathFocused,
    setPathFocused,
    busy,
    loadError,
    pathLocked,
    pathHint,
    activeDshHomeWarning,
    showHostedAppDataWarn,
    showHostedDshWarn,
    dshHomeDisplay,
    showPathFeedback,
    lead,
    enterLocalChoice,
    enterHostedChoice,
    enterHostedReusePath,
    enterLocalReusePath,
    enterHostedNewPath,
    enterLocalNewPath,
    applyHostedUserPath,
    onResetDshHome,
    onBrowseDshHome,
    onConfirm,
  };
}
