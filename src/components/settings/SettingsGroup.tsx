import type { ReactNode } from "react";

type Props = {
  /** 卡片上方可见小标题（与侧栏分区名不同层） */
  title: string;
  children: ReactNode;
  /** 危险区：色边 + 标题强调 */
  danger?: boolean;
};

/** 设置页内小节：标题在上，下方为抬升面板。 */
export function SettingsGroup({ title, children, danger }: Props) {
  return (
    <section
      className={`settings-group${danger ? " settings-group--danger" : ""}`}
      aria-label={title}
    >
      <h3 className="settings-group-title">{title}</h3>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}
