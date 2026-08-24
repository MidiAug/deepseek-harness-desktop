import { useLocale } from "../../shell/locale";
import { useHostLifecycle } from "../../shell";

type Props = {
  /** 状态文案已在更新行描述里展示时，footer 只保留进度条 */
  showMessage?: boolean;
};

/** 更新组内联进度条（HostLifecycle ops 态）。 */
export function SettingsUpdateProgress({ showMessage = true }: Props) {
  const { t } = useLocale();
  const life = useHostLifecycle();
  const barIndeterminate =
    life.percent == null || life.percent === 75;
  const message = life.message || t("settings.about.progress.busy");

  return (
    <div
      className="settings-update-progress"
      role="status"
      aria-live="polite"
      aria-label={showMessage ? undefined : message}
    >
      {showMessage ? (
        <div className="settings-progress-head">
          <span className="settings-progress-msg">{message}</span>
          {life.percent != null && !barIndeterminate && (
            <span className="settings-progress-pct">{life.percent}%</span>
          )}
        </div>
      ) : null}
      <div
        className={`settings-progress-bar settings-update-progress-bar${barIndeterminate ? " indeterminate" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={
          barIndeterminate ? undefined : (life.percent ?? undefined)
        }
        aria-label={showMessage ? undefined : message}
      >
        <div
          className="settings-progress-fill"
          style={
            barIndeterminate
              ? undefined
              : { width: `${life.percent ?? 0}%` }
          }
        />
      </div>
    </div>
  );
}
