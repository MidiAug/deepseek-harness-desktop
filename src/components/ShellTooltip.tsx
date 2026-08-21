import {
  cloneElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type Ref,
} from "react";

type Side = "bottom" | "top";

type AnchorProps = {
  ref?: Ref<HTMLElement>;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
};

type Props = {
  label: string;
  /** 默认 bottom：顶栏按钮向下弹出，避免被窗裁切 */
  side?: Side;
  /** 悬停延迟（ms）；焦点立即显示 */
  delayMs?: number;
  children: ReactElement<AnchorProps>;
};

/**
 * DSH Tooltip 几何：fixed 深色板、3/7 pad、r8、13/20。
 * 不用 ::after，避免顶栏 overflow / 窗边缘裁切。
 */
export function ShellTooltip({
  label,
  side = "bottom",
  delayMs = 500,
  children,
}: Props) {
  const anchorRef = useRef<HTMLElement | null>(null);
  const childRef = (children as ReactElement<AnchorProps> & { ref?: Ref<HTMLElement> })
    .ref;
  const mergedRef = useCallback(
    (el: HTMLElement | null) => {
      anchorRef.current = el;
      if (typeof childRef === "function") childRef(el);
      else if (childRef != null) {
        (childRef as { current: HTMLElement | null }).current = el;
      }
    },
    [childRef],
  );

  const [pos, setPos] = useState<{ x: number; top: number; bottom: number } | null>(
    null,
  );
  const [placement, setPlacement] = useState<Side>(side);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const hide = () => {
    clearTimer();
    setPos(null);
  };

  const showFromAnchor = () => {
    const el = anchorRef.current;
    if (!el || document.body.classList.contains("suppress-hover")) return;
    const r = el.getBoundingClientRect();
    setPlacement(side);
    setPos({ x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
  };

  const scheduleShow = () => {
    clearTimer();
    if (delayMs <= 0) {
      showFromAnchor();
      return;
    }
    timerRef.current = window.setTimeout(showFromAnchor, delayMs);
  };

  useEffect(() => () => clearTimer(), []);

  useLayoutEffect(() => {
    if (pos == null) return;
    const el = bubbleRef.current;
    if (!el) return;
    const margin = 8;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    let x = pos.x;
    let nextSide = placement;
    let y =
      nextSide === "bottom" ? pos.bottom + margin : pos.top - margin;

    if (nextSide === "bottom" && y + bh > window.innerHeight - 8) {
      nextSide = "top";
      y = pos.top - margin;
      setPlacement("top");
    } else if (nextSide === "top" && y - bh < 8) {
      nextSide = "bottom";
      y = pos.bottom + margin;
      setPlacement("bottom");
    }

    const half = bw / 2;
    if (x - half < 8) x = 8 + half;
    if (x + half > window.innerWidth - 8) x = window.innerWidth - 8 - half;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.dataset.side = nextSide;
  }, [pos, placement]);

  const child = cloneElement(children, {
    ref: mergedRef,
    onMouseEnter: (e) => {
      children.props.onMouseEnter?.(e);
      scheduleShow();
    },
    onMouseLeave: (e) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e) => {
      children.props.onFocus?.(e);
      showFromAnchor();
    },
    onBlur: (e) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {pos != null && (
        <span ref={bubbleRef} className="shell-tooltip" role="tooltip">
          {label}
        </span>
      )}
    </>
  );
}
