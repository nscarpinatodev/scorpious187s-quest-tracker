/**
 * Theme catalog — re-exported from the shared library (scorpious187s-lib).
 *
 * The catalog this module used to ship now lives in the library on the
 * canonical --s187-* namespace; theme.vars keys are therefore --s187-*, not
 * --sqt-*. The library mirrors values onto --sqt-* at :root, so stylesheets
 * are unaffected; only code that reads theme.vars keys directly needs the
 * canonical names (see system-config.js).
 */
export {
  THEME_CATEGORIES,
  getAllThemes,
  getTheme,
  getThemeChoices,
} from '/modules/scorpious187s-lib/scripts/theming/theme-presets.js';
