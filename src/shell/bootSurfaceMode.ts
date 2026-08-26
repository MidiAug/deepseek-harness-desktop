/** Boot 表面分流派生（单测覆盖；useBootPanel 只读 life.bootMeta/bootFault） */

export type BootSurfaceMode = "install" | "status";

export type BootMeta = {
  fastPath: boolean;
  repairing: boolean;
  runtimeKnown: boolean;
};

export type BootFault = {
  message: string | null;
};

export const INITIAL_BOOT_META: BootMeta = {
  fastPath: false,
  repairing: false,
  runtimeKnown: false,
};

export const INITIAL_BOOT_FAULT: BootFault = {
  message: null,
};

export function deriveShowFault(fault: BootFault): boolean {
  return fault.message != null && fault.message.length > 0;
}

export function deriveStealth(
  forceStealth: boolean,
  meta: Pick<BootMeta, "runtimeKnown">,
): boolean {
  return forceStealth || !meta.runtimeKnown;
}

export function deriveSurfaceMode(opts: {
  showFault: boolean;
  awaitingManualStart: boolean;
  embedding: boolean;
  fastPath: boolean;
  runtimeKnown: boolean;
}): BootSurfaceMode {
  if (
    opts.showFault ||
    opts.awaitingManualStart ||
    opts.embedding ||
    opts.fastPath ||
    !opts.runtimeKnown
  ) {
    return "status";
  }
  return "install";
}
