import type { SettingsSection } from "./settingsTypes";
import {
  IconCordisPluginOutline14,
  IconDataOutline16,
  IconGlobeOutline14,
  IconPanelLeftOutline16,
  IconPersonalizationOutline16,
  IconSettingsOutline16,
} from "../chrome/DshIcons";

/** 对齐 DSH SettingsRoot.navIcon：16px glyph + nav 行前置图标。 */
export function settingsNavIcon(id: SettingsSection) {
  const iconProps = { size: 16, className: "settings-nav-icon" };
  switch (id) {
    case "network":
      return <IconGlobeOutline14 {...iconProps} />;
    case "window":
      return <IconPanelLeftOutline16 {...iconProps} />;
    case "appearance":
      return <IconPersonalizationOutline16 {...iconProps} />;
    case "runtime":
      return <IconCordisPluginOutline14 {...iconProps} />;
    case "data":
      return <IconDataOutline16 {...iconProps} />;
    case "about":
      return <IconSettingsOutline16 {...iconProps} />;
  }
}
