import type { ShellSettings } from "../../shell/settings";
import { shellApi, type ReadyPayload } from "../../shell";
import { useLocale } from "../../shell/locale";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  locked: boolean;
  patchRuntime: (
    patch: Partial<ShellSettings>,
    opts?: { debounceMs?: number; softHint?: string },
  ) => void;
  flashHint: (msg: string) => void;
  setError: (error: string | null, retry?: () => void | Promise<void>) => void;
  refreshRuntime: () => void;
  onHarnessReady?: (payload: ReadyPayload) => void;
};

function PathButton({
  which,
  label,
}: {
  which: "dshHome" | "appData" | "logs";
  label: string;
}) {
  return (
    <button
      type="button"
      className="btn ghost"
      onClick={() => void shellApi.openKnownPath(which)}
    >
      {label}
    </button>
  );
}

export function SettingsSectionData({
  settings,
  locked,
  patchRuntime,
  flashHint,
  setError,
  refreshRuntime,
  onHarnessReady,
}: Props) {
  const { t } = useLocale();

  return (
    <div className="settings-section">
      <SettingsPrefRow
        title={t("settings.data.dshHome.title")}
        description={t("settings.data.dshHome.description")}
        layout="stack"
      >
        <input
          className="settings-control"
          type="text"
          placeholder={t("settings.data.dshHome.placeholder")}
          value={settings.dshHomeOverride}
          onChange={(ev) =>
            patchRuntime(
              { dshHomeOverride: ev.target.value },
              {
                debounceMs: 350,
                softHint: t("settings.data.dshHome.saved"),
              },
            )
          }
        />
      </SettingsPrefRow>
      <div className="settings-cell-actions">
        <PathButton which="dshHome" label={t("settings.data.path.dshHome")} />
        <PathButton which="appData" label={t("settings.data.path.appData")} />
        <PathButton which="logs" label={t("settings.data.path.logs")} />
      </div>
      <SettingsPrefRow
        title={t("settings.data.reset.title")}
        description={t("settings.data.reset.description")}
        layout="stack"
      >
        <button
          type="button"
          className="btn ghost"
          disabled={locked}
          onClick={() => {
            if (!window.confirm(t("settings.data.reset.confirm"))) {
              return;
            }
            const runReset = async () => {
              setError(null);
              try {
                const ready = await shellApi.resetHostedRuntime();
                flashHint(t("settings.data.reset.done"));
                refreshRuntime();
                onHarnessReady?.(ready);
              } catch (e) {
                const msg = typeof e === "string" ? e : String(e);
                setError(msg, runReset);
              }
            };
            void runReset();
          }}
        >
          {t("settings.data.reset.button")}
        </button>
      </SettingsPrefRow>
    </div>
  );
}
