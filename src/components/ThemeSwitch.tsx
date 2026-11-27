import { useDistill } from "../state";
import { THEMES } from "../theme";
import { IconMonitor, IconMoon, IconSun } from "./Icons";

const ICON = { system: IconMonitor, light: IconSun, dark: IconMoon };

/** AC-11.1: System, Light or Dark, in the header on every screen. */
export function ThemeSwitch() {
  const { state, setTheme } = useDistill();
  const current = state.settings.theme ?? "system";
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      {THEMES.map(({ id, label }) => {
        const Icon = ICON[id];
        return (
          <button key={id} type="button" role="radio" aria-checked={current === id} title={`${label} theme`}
            onClick={() => void setTheme(id)}>
            <Icon width={16} height={16} /><span className="theme-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
