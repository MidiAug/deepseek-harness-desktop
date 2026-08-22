import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ComponentType } from "react";
import {
  IconArchiveOutline20,
  IconBranchOutline16,
  IconEditOutline16,
  IconTrashOutline16,
} from "./DshIcons";
import { useLocale } from "../../shell/locale";
import type { LocaleKey } from "../../shell/locale/dict";
import type {
  HarnessContextMenuAction,
  HarnessContextMenuZone,
  ShellContextMenuState,
} from "../../shell/types/context-menu";

type SidebarMenuItemDef = {
  id: HarnessContextMenuAction;
  labelKey: LocaleKey;
  Icon: ComponentType<{ size?: number; className?: string }>;
  danger?: boolean;
};

const WORKSPACE_ITEMS: SidebarMenuItemDef[] = [
  { id: "rename", labelKey: "contextMenu.rename", Icon: IconEditOutline16 },
  {
    id: "delete",
    labelKey: "contextMenu.deleteWorkspace",
    Icon: IconTrashOutline16,
    danger: true,
  },
];

const SESSION_ITEMS: SidebarMenuItemDef[] = [
  { id: "rename", labelKey: "contextMenu.rename", Icon: IconEditOutline16 },
  { id: "fork", labelKey: "contextMenu.fork", Icon: IconBranchOutline16 },
  {
    id: "archive",
    labelKey: "contextMenu.archive",
    Icon: IconArchiveOutline20,
  },
];

type TextMenuItemDef = {
  id: HarnessContextMenuAction;
  labelKey: LocaleKey;
  shortcut: string;
};

const CONTENT_COPY_GROUPS: ReadonlyArray<ReadonlyArray<TextMenuItemDef>> = [
  [{ id: "copy", labelKey: "contextMenu.copy", shortcut: "Ctrl+C" }],
  [{ id: "selectAll", labelKey: "contextMenu.selectAll", shortcut: "Ctrl+A" }],
];

const TEXT_EDIT_GROUPS: ReadonlyArray<ReadonlyArray<TextMenuItemDef>> = [
  [
    { id: "undo", labelKey: "contextMenu.undo", shortcut: "Ctrl+Z" },
    { id: "redo", labelKey: "contextMenu.redo", shortcut: "Ctrl+Y" },
  ],
  [
    { id: "cut", labelKey: "contextMenu.cut", shortcut: "Ctrl+X" },
    { id: "copy", labelKey: "contextMenu.copy", shortcut: "Ctrl+C" },
    { id: "paste", labelKey: "contextMenu.paste", shortcut: "Ctrl+V" },
  ],
  [{ id: "selectAll", labelKey: "contextMenu.selectAll", shortcut: "Ctrl+A" }],
];

function sidebarItemsForZone(zone: HarnessContextMenuZone): SidebarMenuItemDef[] {
  return zone === "workspace" ? WORKSPACE_ITEMS : SESSION_ITEMS;
}

type Props = {
  menu: ShellContextMenuState;
  onClose: () => void;
  onSelect: (action: HarnessContextMenuAction) => void;
};

/** 壳顶层右键：侧栏 DSH Menu · 输入/正文复制菜单（分割线 + 快捷键）。 */
export function ShellContextMenu({ menu, onClose, onSelect }: Props) {
  const { t } = useLocale();
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [hoverReady, setHoverReady] = useState(false);

  useLayoutEffect(() => {
    if (!menu) {
      setPos(null);
      setHoverReady(false);
      return;
    }
    setHoverReady(false);
    const margin = 12;
    const el = listRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el?.offsetWidth ?? 218;
    const h = el?.offsetHeight ?? 160;
    let left = menu.x;
    let top = menu.y;
    if (left + w > vw - margin) left = Math.max(margin, vw - margin - w);
    if (top + h > vh - margin) top = Math.max(margin, vh - margin - h);
    setPos({ left, top });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu, onClose]);

  useEffect(() => {
    if (!menu) return;
    function onPointerDown(e: PointerEvent) {
      const el = listRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    }
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const isTextEditStyle = menu.zone === "input" || menu.zone === "content";
  const textEditGroups =
    menu.zone === "content" ? CONTENT_COPY_GROUPS : TEXT_EDIT_GROUPS;
  const style =
    pos != null
      ? { left: pos.left, top: pos.top, visibility: "visible" as const }
      : { left: menu.x, top: menu.y, visibility: "hidden" as const };

  const menuClassName = [
    "shell-context-menu",
    isTextEditStyle ? "shell-context-menu--text-edit" : "",
    hoverReady ? "shell-context-menu--hover-ready" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      ref={listRef}
      className={menuClassName}
      role="menu"
      style={style}
      onPointerMove={() => {
        if (!hoverReady) setHoverReady(true);
      }}
    >
      {isTextEditStyle
        ? textEditGroups.map((group, gi) => (
            <div key={gi} className="shell-context-menu-group">
              {gi > 0 && <div className="shell-context-menu-divider" role="separator" />}
              {group.map(({ id, labelKey, shortcut }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className="shell-context-menu-item shell-context-menu-item--text-edit"
                  onClick={() => onSelect(id)}
                >
                  <span className="shell-context-menu-label">{t(labelKey)}</span>
                  <span className="shell-context-menu-shortcut">{shortcut}</span>
                </button>
              ))}
            </div>
          ))
        : sidebarItemsForZone(menu.zone).map(({ id, labelKey, Icon, danger }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={`shell-context-menu-item${danger ? " danger" : ""}`}
              onClick={() => onSelect(id)}
            >
              <span className="shell-context-menu-icon" aria-hidden>
                <Icon size={16} />
              </span>
              <span className="shell-context-menu-label">{t(labelKey)}</span>
            </button>
          ))}
    </div>,
    document.body,
  );
}
