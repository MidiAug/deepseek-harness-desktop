import { BOOT_STAGES, stageIndex } from "../../shell";
import type { BootStageId } from "../../shell";
import type { useLocale } from "../../shell/locale";

type TFn = ReturnType<typeof useLocale>["t"];

export function BootPanelSteps({
  stageId,
  t,
}: {
  stageId: BootStageId | null;
  t: TFn;
}) {
  const activeIdx = stageIndex(stageId);
  return (
    <ol className="boot-steps" aria-label={t("boot.steps")}>
      {BOOT_STAGES.map((s, i) => {
        const state =
          i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
        return (
          <li key={s.id} className={`boot-step ${state}`}>
            {i > 0 && (
              <span className="boot-step-sep" aria-hidden>
                /
              </span>
            )}
            <span className="boot-step-label">{t(s.labelKey)}</span>
          </li>
        );
      })}
    </ol>
  );
}
