import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  children: ReactNode;
  /** 控件在右侧（默认）或下方（块级，如色卡） */
  layout?: "row" | "stack";
  disabled?: boolean;
};

/** 对齐 DSH Setting-Cell：主文 14/22 + 次文 12/18 + 底部分割。 */
export function SettingsPrefRow({
  title,
  description,
  children,
  layout = "row",
  disabled,
}: Props) {
  return (
    <div
      className={`settings-cell${layout === "stack" ? " stack" : ""}${disabled ? " is-disabled" : ""}`}
      aria-disabled={disabled || undefined}
    >
      <div className="settings-cell-copy">
        <span className="settings-cell-title">{title}</span>
        {description ? (
          <span className="settings-cell-desc">{description}</span>
        ) : null}
      </div>
      <div className="settings-cell-control">{children}</div>
    </div>
  );
}
