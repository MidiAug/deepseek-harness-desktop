import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  disabled?: boolean;
  actions: ReactNode;
  footer?: ReactNode;
};

/** 关于页更新行：左文案 + 右操作；footer 放进度/错误等内联态。 */
export function SettingsUpdateRow({
  title,
  description,
  disabled,
  actions,
  footer,
}: Props) {
  return (
    <div
      className={`settings-update-row${disabled ? " is-disabled" : ""}`}
    >
      <div className="settings-cell">
        <div className="settings-cell-copy">
          <span className="settings-cell-title">{title}</span>
          <span className="settings-cell-desc">{description}</span>
        </div>
        <div className="settings-cell-control">{actions}</div>
      </div>
      {footer ? <div className="settings-update-row-footer">{footer}</div> : null}
    </div>
  );
}
