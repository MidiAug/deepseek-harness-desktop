/** Settings 内 harness 生命周期失败：清本地 fault，上送 bootFault。 */

export function reportHarnessLifecycleFailure(
  clearSettingsFault: () => void,
  onHarnessOpFailed: ((message: string) => void) | undefined,
  message: string,
): void {
  clearSettingsFault();
  onHarnessOpFailed?.(message);
}
