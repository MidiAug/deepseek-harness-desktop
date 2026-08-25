import { ShellConfirmDialog } from "./ShellConfirmDialog";
import type { RecoveryDialogState } from "../../shell/hooks/useHarnessRecoveryActions";

/** Recovery hook 配套确认弹窗（三 action）。 */
export function HarnessRecoveryDialogs({ dialogs }: { dialogs: RecoveryDialogState }) {
  return (
    <>
      <ShellConfirmDialog
        open={dialogs.cleanProfile.open}
        titleKey={dialogs.cleanProfile.titleKey}
        bodyKey={dialogs.cleanProfile.bodyKey}
        busy={dialogs.cleanProfile.busy}
        onCancel={dialogs.cleanProfile.onCancel}
        onConfirm={dialogs.cleanProfile.onConfirm}
      />
      <ShellConfirmDialog
        open={dialogs.resetConfig.open}
        titleKey="boot.resetConfig.confirmTitle"
        bodyKey="boot.resetConfig.confirm"
        bodyParams={dialogs.resetConfig.bodyParams}
        busy={dialogs.resetConfig.busy}
        onCancel={dialogs.resetConfig.onCancel}
        onConfirm={dialogs.resetConfig.onConfirm}
      />
      <ShellConfirmDialog
        open={dialogs.reinstallDsh.open}
        titleKey="boot.reinstallDsh.confirmTitle"
        bodyKey={dialogs.reinstallDsh.bodyKey}
        busy={dialogs.reinstallDsh.busy}
        onCancel={dialogs.reinstallDsh.onCancel}
        onConfirm={dialogs.reinstallDsh.onConfirm}
      />
    </>
  );
}
