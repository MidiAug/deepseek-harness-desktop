import type { ComponentType } from "react";
import type { ShellSettings, ShellTheme } from "../../shell/settings";
import {
  IconDarkOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
} from "../chrome/DshIcons";
import { SettingsPrefRow } from "./SettingsPrefRow";

type Props = {
  settings: ShellSettings;
  compactOn: boolean;
  patchAppearance: (
    patch: Partial<
      Pick<
        ShellSettings,
        | "shellTheme"
        | "titlebarCompact"
        | "selectionHygiene"
        | "sessionLogInTitlebar"
      >
    >,
  ) => void;
};

/** 对齐 DSH AppearanceRow：三块 preference cube（图标 + 文案）。 */
const THEME_CUBES: {
  id: ShellTheme;
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { id: "light", label: "浅色", Icon: IconLightOutline16 },
  { id: "dark", label: "深色", Icon: IconDarkOutline16 },
  { id: "system", label: "跟随系统", Icon: IconFollowsystemOutline16 },
];

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
        title="主题"
        description="与 DeepSeek Harness 共用同一偏好（~/.dsh/settings.yaml）。任一侧修改，另一侧同步。"
        layout="stack"
      >
        <div
          className="settings-theme-cubes"
          role="radiogroup"
          aria-label="主题"
        >
          {THEME_CUBES.map(({ id, label, Icon }) => {
            const selected = settings.shellTheme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`settings-theme-cube${selected ? " on" : ""}`}
                onClick={() => patchAppearance({ shellTheme: id })}
              >
                <Icon />
                {label}
              </button>
            );
          })}
        </div>
      </SettingsPrefRow>

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
        title="减少误选界面文字"
        description="拖选或全选对话时，尽量不带上侧栏、时间戳、按钮提示和输入区控件；聊天正文与代码块仍可正常复制。"
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
