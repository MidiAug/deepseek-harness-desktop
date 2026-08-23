/** 壳更新就绪横幅：后台下完后提示用户确认安装重启。 */

import { useShellUpdate } from "../../shell";
import { useLocale } from "../../shell/locale";

export function ShellUpdateBanner() {
  const upd = useShellUpdate();
  const { t } = useLocale();

  if (upd.phase !== "downloaded" && upd.phase !== "downloading") {
    return null;
  }

  const versionLabel = upd.version ?? t("chrome.updateBanner.newVersion");

  return (
    <div className="shell-update-banner" role="status" aria-live="polite">
      <div className="shell-update-banner-text">
        {upd.phase === "downloading" ? (
          <>
            {t("settings.about.shellUpdate.downloading")}
            {upd.version ? ` ${upd.version}` : ""}
            {upd.percent != null ? ` · ${upd.percent}%` : "…"}
          </>
        ) : (
          t("chrome.updateBanner.downloaded", { version: versionLabel })
        )}
      </div>
      {upd.phase === "downloaded" && (
        <button
          type="button"
          className="btn"
          onClick={() => void upd.installAndRelaunch()}
        >
          {t("settings.about.shellUpdate.install")}
        </button>
      )}
    </div>
  );
}
