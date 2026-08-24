import { ShellTooltip } from "../chrome/ShellTooltip";
import { useLocale } from "../../shell/locale";
import type { LocaleKey } from "../../shell/locale/dict";
import { shortenPathForDisplay } from "../../shell/formatPathShort";

type Props = {
  tone?: "warn" | "error";
  conflictPath?: string;
  resolvedPath: string;
  messageKey?: LocaleKey;
};

function pathConflictTooltip(conflict: string, resolved: string): string {
  const from = shortenPathForDisplay(conflict);
  const to = shortenPathForDisplay(resolved);
  if (from.toLowerCase() === to.toLowerCase()) return from;
  return `${from}\n→ ${to}`;
}

export function OnboardingPathWarn({
  tone = "warn",
  conflictPath,
  resolvedPath,
  messageKey,
}: Props) {
  const { t } = useLocale();
  const leadKey: LocaleKey =
    messageKey ?? "onboarding.path.warnAutoAdjusted";
  const text = t(leadKey);

  const tooltipLabel =
    conflictPath && tone === "warn"
      ? pathConflictTooltip(conflictPath, resolvedPath)
      : null;

  const tag = (
    <p
      className={`onboarding-path-note${tone === "error" ? " is-error" : tone === "warn" ? " is-warn" : ""}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {text}
    </p>
  );

  if (!tooltipLabel) return tag;

  return (
    <ShellTooltip label={tooltipLabel} side="top" delayMs={400}>
      <span className="onboarding-path-note-hover" tabIndex={0}>
        {tag}
      </span>
    </ShellTooltip>
  );
}
