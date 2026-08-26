import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { IconCheckOutline16, IconChevronDownOutline14 } from "./DshIcons";

export type ShellSelectOption = {
  value: string;
  label: string;
  /** 不可用（如本机未装 dsh）；仍展示但不可选 */
  disabled?: boolean;
  /** disabled 时原生 title 提示 */
  title?: string;
};

type Props = {
  value: string;
  options: ShellSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

/** 自绘下拉：对齐 DSH PermissionRow / ModelSelect（胶囊触发器 + 勾选菜单）。 */
export function ShellSelect({
  value,
  options,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value) ?? options[0];

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`shell-select${open ? " open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="shell-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
      >
        <span className="shell-select-value">{selected?.label ?? value}</span>
        <span className="shell-select-chevron" aria-hidden>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          className="shell-select-menu"
          role="listbox"
          aria-activedescendant={
            selected ? `${listId}-${selected.value}` : undefined
          }
        >
          {options.map((opt) => {
            const isOn = opt.value === value;
            const optDisabled = Boolean(opt.disabled);
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  id={`${listId}-${opt.value}`}
                  role="option"
                  aria-selected={isOn}
                  aria-disabled={optDisabled || undefined}
                  disabled={optDisabled}
                  title={optDisabled ? opt.title : undefined}
                  className={`shell-select-option${isOn ? " on" : ""}${optDisabled ? " is-disabled" : ""}`}
                  onClick={() => {
                    if (optDisabled) return;
                    onChange(opt.value);
                    close();
                  }}
                >
                  <span className="shell-select-option-label">{opt.label}</span>
                  {isOn ? (
                    <span className="shell-select-check" aria-hidden>
                      <IconCheckOutline16 />
                    </span>
                  ) : (
                    <span className="shell-select-check spacer" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
