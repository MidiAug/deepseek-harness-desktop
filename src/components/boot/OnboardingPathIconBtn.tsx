import type { ReactElement } from "react";
import { ShellTooltip } from "../chrome/ShellTooltip";

type Props = {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactElement;
};

/** 首跑路径行图标钮：28×28 圆 + ShellTooltip（对齐 DSH MessageIconActions） */
export function OnboardingPathIconBtn({
  label,
  disabled = false,
  onClick,
  children,
}: Props) {
  return (
    <ShellTooltip label={label} side="top" delayMs={300}>
      <button
        type="button"
        className="onboarding-path-icon-btn"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    </ShellTooltip>
  );
}
