import { MODULE_ID, SETTINGS } from './constants.js';
import { getTheme } from './data/theme-presets.js';

const SQT_VARS = [
  '--sqt-bg-primary', '--sqt-bg-secondary', '--sqt-bg-header',
  '--sqt-bg-item', '--sqt-bg-item-hover',
  '--sqt-text-primary', '--sqt-text-secondary', '--sqt-text-header',
  '--sqt-accent', '--sqt-accent-hover',
  '--sqt-border', '--sqt-border-light',
  '--sqt-shadow',
  '--sqt-badge-bg', '--sqt-badge-text',
  '--sqt-btn-bg', '--sqt-btn-text', '--sqt-btn-hover',
  '--sqt-inactive-col', '--sqt-available-col', '--sqt-active-col',
  '--sqt-completed-col', '--sqt-failed-col',
  '--sqt-font-heading', '--sqt-font-body',
  '--sqt-radius', '--sqt-header-texture',
  '--sqt-input-border', '--sqt-input-bg', '--sqt-input-text',
];

// Elements Foundry's stylesheet overrides with high-specificity rules.
// We punch through by setting inline !important using var() references,
// which dynamically track :root var changes without needing re-application.
const INLINE_BG_TARGETS = [
  // selector                    background var             color var (optional)
  ['.sqt-window',               'var(--sqt-bg-primary)',   'var(--sqt-text-primary)'],
  ['.sqt-tabbar',               'var(--sqt-bg-header)',    null],
  ['.sqt-sheet-header',         'var(--sqt-bg-header)',    null],
  ['.sqt-section',              'var(--sqt-bg-secondary)', null],
  ['.sqt-config-section',       'var(--sqt-bg-secondary)', null],
  ['.sqt-sheet-footer',         'var(--sqt-bg-secondary)', null],
  ['.sqt-tab-content',          'var(--sqt-bg-primary)',   null],
  ['.sqt-panels',               'var(--sqt-bg-primary)',   null],
  ['.sqt-quest-item',           'var(--sqt-bg-item)',      null],
  ['.sqt-actor-row',            'var(--sqt-bg-item)',      null],
  ['.sqt-rewards-header',       'var(--sqt-bg-header)',    null],
  ['.sqt-sheet-form',           'transparent',             null],
  ['.sqt-sheet-body',           'transparent',             null],
  ['.sqt-config-body',          'transparent',             null],
];

const INLINE_INPUT_TARGETS = 'input[type="text"], input[type="number"], input[type="search"], textarea, select';

export class ThemeManager {

  static _fontOverrides() {
    try {
      const cfg = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
      const overrides = {};
      if (cfg?.fontHeading) overrides['--sqt-font-heading'] = cfg.fontHeading;
      if (cfg?.fontBody)    overrides['--sqt-font-body']    = cfg.fontBody;
      return overrides;
    } catch { return {}; }
  }

  static apply(themeId) {
    const resolvedId = themeId ?? game.settings.get(MODULE_ID, SETTINGS.THEME);
    const theme = getTheme(resolvedId);
    const custom = resolvedId === 'custom' ? (game.settings.get(MODULE_ID, SETTINGS.CUSTOM_THEME) ?? {}) : {};
    const vars = { ...theme.vars, ...custom, ...ThemeManager._fontOverrides() };

    ThemeManager._setRootVars(vars);

    document.querySelectorAll('[data-sqt-theme]').forEach(el => {
      el.dataset.sqtTheme = resolvedId;
    });
    document.querySelectorAll('.application.sqt-window').forEach(app => {
      ThemeManager._styleWindowChrome(app);
      ThemeManager._applyInlineBackgrounds(app);
    });

    return theme;
  }

  static current() {
    return getTheme(game.settings.get(MODULE_ID, SETTINGS.THEME));
  }

  static applyToElement(el, themeId) {
    if (!el) return;
    const resolvedId = themeId ?? game.settings.get(MODULE_ID, SETTINGS.THEME);
    const theme = getTheme(resolvedId);
    const custom = resolvedId === 'custom' ? (game.settings.get(MODULE_ID, SETTINGS.CUSTOM_THEME) ?? {}) : {};
    const vars = { ...theme.vars, ...custom, ...ThemeManager._fontOverrides() };

    ThemeManager._setRootVars(vars);
    el.dataset.sqtTheme = resolvedId;
    ThemeManager._styleWindowChrome(el);
    ThemeManager._applyInlineBackgrounds(el);

    // querySelectorAll can't match the root element itself — apply bg/color
    // directly if it carries sqt-window but NOT sqt-note (the note popup keeps
    // its wrapper transparent; its inner frame handles the visual background).
    if (el.classList.contains('sqt-window') && !el.classList.contains('sqt-note')) {
      el.style.setProperty('background', 'var(--sqt-bg-primary)', 'important');
      el.style.setProperty('color',      'var(--sqt-text-primary)', 'important');
    }
  }

  // Sets theme vars on :root as inline styles so every var(--sqt-*) in the
  // stylesheet resolves to the active theme. Removes vars the theme doesn't
  // define so they fall back to the :root {} CSS defaults.
  static _setRootVars(vars) {
    const root = document.documentElement;
    for (const k of SQT_VARS) {
      if (vars[k] !== undefined) {
        root.style.setProperty(k, vars[k]);
      } else {
        root.style.removeProperty(k);
      }
    }
  }

  // Sets inline backgrounds using var() references. Inline !important beats
  // any stylesheet rule; var() means values track :root changes live without
  // needing to be re-set on every theme change.
  static _applyInlineBackgrounds(appEl) {
    for (const [selector, bgValue, colorValue] of INLINE_BG_TARGETS) {
      appEl.querySelectorAll(selector).forEach(el => {
        el.style.setProperty('background', bgValue, 'important');
        if (colorValue) el.style.setProperty('color', colorValue, 'important');
      });
    }
    // Form inputs — Foundry aggressively styles these
    appEl.querySelectorAll(INLINE_INPUT_TARGETS).forEach(el => {
      el.style.setProperty('background',   'var(--sqt-input-bg, var(--sqt-bg-primary))', 'important');
      el.style.setProperty('color',        'var(--sqt-input-text, var(--sqt-text-primary))', 'important');
      el.style.setProperty('border-color', 'var(--sqt-input-border, var(--sqt-border))', 'important');
    });
  }

  // Sets inline styles on the Foundry window chrome. Uses var() references
  // so values track :root changes without needing re-application.
  static _styleWindowChrome(appEl) {
    const header = appEl.querySelector(':scope > .window-header');
    if (header) {
      header.style.setProperty('background',    'var(--sqt-bg-header)', 'important');
      header.style.setProperty('border-bottom', '2px solid var(--sqt-accent)', 'important');
    }
    const title = appEl.querySelector(':scope > .window-header .window-title');
    if (title) title.style.setProperty('color', 'var(--sqt-text-header)', 'important');
  }
}
