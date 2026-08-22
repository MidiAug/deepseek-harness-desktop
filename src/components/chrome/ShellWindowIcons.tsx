/**
 * 桌面壳独有窗控图标（16 网格 fill，语法对齐 ic_ds_*；DSH 无现成 minimize/maximize）。
 */

type IconProps = {
  size?: number;
  className?: string;
};

export function IconWinMinimize16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M2.8 9.1h10.4v1.8H2.8V9.1Z" fill="currentColor" />
    </svg>
  );
}

export function IconWinMaximize16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.4 3.4h9.2v9.2H3.4V3.4zm1.45 1.45v6.3h6.3v-6.3H4.85z"
        fill="currentColor"
      />
    </svg>
  );
}

export function IconWinRestore16({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2.5 4.2h7.5v7.5H2.5V4.2zm1.3 1.3v4.9h4.9V5.5H3.8z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 2.5h7.5v7.5H6V2.5zm1.3 1.3v4.9h4.9V3.8H7.3z"
        fill="currentColor"
      />
    </svg>
  );
}
