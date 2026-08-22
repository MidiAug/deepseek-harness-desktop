import type { ShellSettings } from "../../shell/settings";
import { SettingsPrefRow } from "./SettingsPrefRow";
import { STYLE_OPTIONS } from "./settingsTypes";

type Props = {
  settings: ShellSettings;
  compactOn: boolean;
  patchAppearance: (
    patch: Partial<
      Pick<
        ShellSettings,
        | "titlebarStyle"
        | "titlebarCompact"
        | "selectionHygiene"
        | "sessionLogInTitlebar"
      >
    >,
  ) => void;
};

export function SettingsSectionAppearance({
  settings,
  compactOn,
  patchAppearance,
}: Props) {
  const hygieneOn = settings.selectionHygiene;
  const sessionLogOn = settings.sessionLogInTitlebar;

  return (
    <div className="settings-section appearance-panel">
      <SettingsPrefRow
        title="简洁模式"
        description="透明顶栏叠在官方 UI 上（左侧随侧栏、右侧可拖）；窗控悬停显现"
      >
        <button
          type="button"
          className={`settings-switch${compactOn ? " on" : ""}`}
          role="switch"
          aria-checked={compactOn}
          aria-label="简洁模式"
          onClick={() =>
            patchAppearance({ titlebarCompact: !compactOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>

      <SettingsPrefRow
        title="隐藏官方 Session log"
        description={
          compactOn
            ? "隐藏右上官方按钮，改用顶栏下载（与原按钮相同）"
            : "仅在简洁模式下生效"
        }
        disabled={!compactOn}
      >
        <button
          type="button"
          className={`settings-switch${sessionLogOn ? " on" : ""}`}
          role="switch"
          aria-checked={sessionLogOn}
          aria-label="隐藏官方 Session log"
          disabled={!compactOn}
          onClick={() =>
            patchAppearance({ sessionLogInTitlebar: !sessionLogOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>

      <SettingsPrefRow
        title="顶栏颜色"
        description={
          compactOn
            ? "简洁模式使用透明叠层顶栏，颜色设置不可用"
            : "选择顶栏底色；改动立即生效"
        }
        layout="stack"
        disabled={compactOn}
      >
        <div
          className="settings-style-grid"
          role="radiogroup"
          aria-label="顶栏颜色"
        >
          {STYLE_OPTIONS.map((opt) => {
            const selected = settings.titlebarStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={compactOn}
                className={`settings-style-card${selected ? " on" : ""} style-${opt.id}`}
                onClick={() =>
                  patchAppearance({ titlebarStyle: opt.id })
                }
              >
                <span className={`style-preview ${opt.id}`} />
                <span className="style-meta">
                  <span className="style-name">{opt.label}</span>
                  <span className="style-hint">{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsPrefRow>

      <SettingsPrefRow
        title="减少误选界面文字"
        description="开启后：侧栏、模式切换、输入区权限下拉等不可拖选；输入框与对话正文仍可复制。默认关闭。"
      >
        <button
          type="button"
          className={`settings-switch${hygieneOn ? " on" : ""}`}
          role="switch"
          aria-checked={hygieneOn}
          aria-label="减少误选界面文字"
          onClick={() =>
            patchAppearance({ selectionHygiene: !hygieneOn })
          }
        >
          <span className="settings-switch-knob" />
        </button>
      </SettingsPrefRow>
    </div>
  );
}
