/** 壳更新就绪横幅：后台下完后提示用户确认安装重启。 */

import { useShellUpdate } from "../shell/ShellUpdateProvider";

export function ShellUpdateBanner() {
  const upd = useShellUpdate();

  if (upd.phase !== "downloaded" && upd.phase !== "downloading") {
    return null;
  }

  return (
    <div className="shell-update-banner" role="status" aria-live="polite">
      <div className="shell-update-banner-text">
        {upd.phase === "downloading" ? (
          <>
            正在下载壳更新
            {upd.version ? ` ${upd.version}` : ""}
            {upd.percent != null ? ` · ${upd.percent}%` : "…"}
          </>
        ) : (
          <>
            壳 {upd.version ?? "新版本"} 已下载完成，重启后安装
          </>
        )}
      </div>
      {upd.phase === "downloaded" && (
        <button
          type="button"
          className="btn"
          onClick={() => void upd.installAndRelaunch()}
        >
          立即重启安装
        </button>
      )}
    </div>
  );
}
