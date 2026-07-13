import { MODULE_ID, LIB_ID } from './constants.js';

/**
 * Thin delegate to the shared library's ThemeManager (scorpious187s-lib).
 *
 * The full theming engine — the canonical --s187-* variables, the mirrored
 * --sqt-* prefix this module's stylesheet reads, window-chrome styling, and
 * the [data-sqt-theme] re-stamping — lives in the library. This class keeps
 * the static call signatures the rest of the module (and older sibling
 * modules via mod.api.ThemeManager) was written against.
 *
 * The theming registration itself (prefix, window class, inline targets,
 * font overrides) happens in main.js at init.
 */

function libTheming() {
  return game.modules.get(LIB_ID)?.api?.theming ?? null;
}

export class ThemeManager {

  /** Apply the family theme (or an explicit id) globally. */
  static apply(themeId) {
    return libTheming()?.ThemeManager.apply(themeId);
  }

  /** The active theme object from the shared catalog. */
  static current() {
    return libTheming()?.ThemeManager.getActiveTheme() ?? null;
  }

  /** Apply the theme to a single application element. */
  static applyToElement(el, themeId) {
    libTheming()?.ThemeManager.applyToElement(el, MODULE_ID, themeId);
  }

  /** The family-wide active theme id (lib is the authority). */
  static activeThemeId() {
    try {
      return game.settings.get(LIB_ID, 'theme') || 'fantasy-parchment';
    } catch {
      return 'fantasy-parchment';
    }
  }
}
