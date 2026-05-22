import { MODULE_ID, SETTINGS } from './constants.js';
import { getTheme } from './data/theme-presets.js';

const STYLE_ELEMENT_ID = 'sqt-dynamic-theme';

export class ThemeManager {

  /** Apply the current theme to every open SQT window. */
  static apply(themeId) {
    const theme = getTheme(themeId ?? game.settings.get(MODULE_ID, SETTINGS.THEME));
    const custom = game.settings.get(MODULE_ID, SETTINGS.CUSTOM_THEME) ?? {};

    const vars = { ...theme.vars, ...custom };
    ThemeManager._injectCSS(vars);

    // Stamp data attribute on all open SQT windows
    document.querySelectorAll('.sqt-window').forEach(el => {
      el.dataset.sqtTheme = themeId;
    });

    return theme;
  }

  /** Get the theme object for the currently-selected theme. */
  static current() {
    const id = game.settings.get(MODULE_ID, SETTINGS.THEME);
    return getTheme(id);
  }

  /** Inject CSS custom property overrides into a single <style> tag. */
  static _injectCSS(vars) {
    let el = document.getElementById(STYLE_ELEMENT_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ELEMENT_ID;
      document.head.appendChild(el);
    }
    const rules = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
    el.textContent = `.sqt-window {\n${rules}\n}`;
  }

  /** Stamp the theme attribute and re-apply CSS to a specific window element. */
  static applyToElement(el, themeId) {
    el.dataset.sqtTheme = themeId ?? game.settings.get(MODULE_ID, SETTINGS.THEME);
    ThemeManager.apply(themeId);
  }
}
