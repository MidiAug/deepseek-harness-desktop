/** 跨 hook 传递 harness 启动 op_id（restart / titlebar 等 → BootPanel IPC）。 */

export type LinkedHarnessStart = {
  opId: string;
  action: string;
};

let pending: LinkedHarnessStart | null = null;

export function setLinkedHarnessStart(link: LinkedHarnessStart): void {
  pending = link;
}

export function takeLinkedHarnessStart(): LinkedHarnessStart | null {
  const v = pending;
  pending = null;
  return v;
}
