import { MODULE_ID, SETTINGS, SOCKET_TYPES } from '../constants.js';
import { SYSTEM_PRESETS, getSystemPreset, getSystemPresetList } from '../data/system-presets.js';
import { THEME_CATEGORIES } from '../data/theme-presets.js';
import { ThemeManager } from '../theme-manager.js';

const FONT_OPTIONS = [
  { value: '',                                                                   label: 'Theme Default' },
  { value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",               label: 'Palatino' },
  { value: "'Georgia', 'Times New Roman', serif",                                label: 'Georgia' },
  { value: "'Times New Roman', serif",                                           label: 'Times New Roman' },
  { value: "'Segoe UI', Arial, sans-serif",                                      label: 'Segoe UI' },
  { value: "'Trebuchet MS', Arial, sans-serif",                                  label: 'Trebuchet MS' },
  { value: "'Franklin Gothic Medium', 'Arial Narrow Bold', sans-serif",          label: 'Franklin Gothic' },
  { value: "'Arial Narrow', Arial, sans-serif",                                  label: 'Arial Narrow' },
  { value: "'Arial Black', Impact, sans-serif",                                  label: 'Arial Black' },
  { value: "Impact, 'Arial Narrow Bold', sans-serif",                            label: 'Impact' },
  { value: "'Courier New', 'Lucida Console', monospace",                         label: 'Courier New (Mono)' },
];

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SystemConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'sqt-system-config',
    classes: ['sqt-window', 'sqt-config'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      title: 'QUESTTRACKER.Settings.Title',
      icon: 'fas fa-cog',
      minimizable: false,
      resizable: true,
    },
    position: { width: 946, height: 1001 },
    actions: {
      save:             SystemConfigApp._onSave,
      cancel:           SystemConfigApp._onCancel,
      loadPreset:       SystemConfigApp._onLoadPreset,
      addCurrency:      SystemConfigApp._onAddCurrency,
      removeCurrency:   SystemConfigApp._onRemoveCurrency,
      previewTheme:     SystemConfigApp._onPreviewTheme,
    },
  };

  static PARTS = {
    config: {
      template: `modules/${MODULE_ID}/templates/system-config.hbs`,
      scrollable: ['.sqt-config-body'],
    },
  };

  async _prepareContext(options) {
    const ctx        = await super._prepareContext(options);
    const sysConfig  = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const themeId    = game.settings.get(MODULE_ID, SETTINGS.THEME);
    const customVars = game.settings.get(MODULE_ID, SETTINGS.CUSTOM_THEME);
    const notifPrefs = game.settings.get(MODULE_ID, SETTINGS.NOTIFICATIONS);

    const currentPreset = getSystemPreset(sysConfig.preset);
    const currency = sysConfig.currency?.length
      ? sysConfig.currency
      : currentPreset.currency ?? [];

    const fontHeading = sysConfig.fontHeading ?? '';
    const fontBody    = sysConfig.fontBody    ?? '';

    // Fonts registered in Foundry's font system (user-added custom fonts + module fonts)
    const foundryFontOptions = Object.keys(CONFIG.fontDefinitions ?? {})
      .filter(name => name?.trim())
      .sort((a, b) => a.localeCompare(b))
      .map(name => ({ value: `'${name}'`, label: name }));

    const minObjectiveRole = sysConfig.minObjectiveRole ?? 1;
    const dragPermission   = sysConfig.dragPermission   ?? 'gm';

    const roleOptions = [
      { value: 1, label: game.i18n.localize('USER.RolePlayer')    || 'Player' },
      { value: 2, label: game.i18n.localize('USER.RoleTrusted')   || 'Trusted Player' },
      { value: 3, label: game.i18n.localize('USER.RoleAssistant') || 'Assistant GM' },
      { value: 4, label: game.i18n.localize('USER.RoleGamemaster')|| 'Game Master' },
    ];

    const dragPermissionOptions = [
      { value: 'gm',      label: 'GM Only' },
      { value: 'trusted', label: 'Trusted Player+' },
      { value: 'player',  label: 'All Players' },
    ];

    return {
      ...ctx,
      sysConfig,
      themeId,
      customVars,
      notifPrefs,
      currency,
      fontHeading,
      fontBody,
      fontOptions: FONT_OPTIONS,
      foundryFontOptions,
      systemPresets: getSystemPresetList(),
      themeCategories: THEME_CATEGORIES,
      minObjectiveRole,
      dragPermission,
      roleOptions,
      dragPermissionOptions,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    ThemeManager.applyToElement(this.element, context.themeId);

    // Preset selector change
    const presetSel = this.element.querySelector('#sqt-system-preset');
    presetSel?.addEventListener('change', () => {
      const presetId = presetSel.value;
      this._fillFromPreset(presetId);
    });
  }

  _fillFromPreset(presetId) {
    const preset = getSystemPreset(presetId);
    const xpCheck  = this.element.querySelector('#sqt-xp-enabled');
    const curCheck = this.element.querySelector('#sqt-currency-enabled');
    if (xpCheck)  xpCheck.checked  = preset.xpEnabled;
    if (curCheck) curCheck.checked = preset.currencyEnabled;

    // Rebuild currency rows
    const container = this.element.querySelector('#sqt-currency-list');
    if (!container) return;
    container.innerHTML = '';
    for (const cur of (preset.currency ?? [])) {
      container.appendChild(this._buildCurrencyRow(cur));
    }
  }

  _buildCurrencyRow({ key = '', label = '', conversion = 1 } = {}) {
    const row = document.createElement('div');
    row.className = 'sqt-currency-row';
    row.innerHTML = `
      <input type="text" class="sqt-cur-key"   value="${key}"        placeholder="gp"   maxlength="8">
      <input type="text" class="sqt-cur-label" value="${label}"      placeholder="Gold">
      <input type="number" class="sqt-cur-conv" value="${conversion}" placeholder="1.0" step="0.01" min="0">
      <button type="button" data-action="removeCurrency" class="sqt-icon-btn sqt-danger" title="Remove">
        <i class="fas fa-trash"></i>
      </button>`;
    return row;
  }

  _gatherFormData() {
    const el = this.element;

    const currency = [];
    el.querySelectorAll('.sqt-currency-row').forEach(row => {
      const key   = row.querySelector('.sqt-cur-key')?.value.trim();
      const label = row.querySelector('.sqt-cur-label')?.value.trim();
      const conv  = parseFloat(row.querySelector('.sqt-cur-conv')?.value) || 1;
      if (key) currency.push({ key, label, conversion: conv });
    });

    return {
      system: {
        preset:             el.querySelector('#sqt-system-preset')?.value    ?? 'custom',
        xpEnabled:          el.querySelector('#sqt-xp-enabled')?.checked     ?? false,
        currencyEnabled:    el.querySelector('#sqt-currency-enabled')?.checked ?? false,
        currency,
        fontHeading:        el.querySelector('#sqt-font-heading')?.value     ?? '',
        fontBody:           el.querySelector('#sqt-font-body')?.value        ?? '',
        minObjectiveRole:   parseInt(el.querySelector('#sqt-min-objective-role')?.value ?? '1', 10),
        dragPermission:     el.querySelector('#sqt-drag-permission')?.value  ?? 'gm',
      },
      theme:   el.querySelector('#sqt-theme-select')?.value,
      notifs: {
        questNoteEnabled: el.querySelector('#sqt-note-enabled')?.checked ?? true,
        autoShowTracker:  el.querySelector('#sqt-auto-tracker')?.checked ?? false,
      },
      customVars: this._gatherCustomVars(),
    };
  }

  _gatherCustomVars() {
    const vars = {};
    this.element.querySelectorAll('.sqt-custom-var').forEach(input => {
      const key = input.dataset.var;
      const val = input.value.trim();
      if (key && val) vars[key] = val;
    });
    return vars;
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  static async _onSave(event, target) {
    const data = this._gatherFormData();

    await game.settings.set(MODULE_ID, SETTINGS.SYSTEM_CONFIG, {
      preset:            data.system.preset,
      xpEnabled:         data.system.xpEnabled,
      currencyEnabled:   data.system.currencyEnabled,
      currency:          data.system.currency,
      fontHeading:       data.system.fontHeading,
      fontBody:          data.system.fontBody,
      minObjectiveRole:  data.system.minObjectiveRole,
      dragPermission:    data.system.dragPermission,
    });

    await game.settings.set(MODULE_ID, SETTINGS.NOTIFICATIONS, data.notifs);

    // Save custom vars before theme so the onChange hook reads the latest custom vars.
    await game.settings.set(MODULE_ID, SETTINGS.CUSTOM_THEME, data.customVars);

    if (data.theme) {
      await game.settings.set(MODULE_ID, SETTINGS.THEME, data.theme);
    }

    ThemeManager.apply(data.theme);

    ui.notifications.info(game.i18n.localize('QUESTTRACKER.Settings.Saved'));
    this.close();
  }

  static _onCancel(event, target) {
    this.close();
  }

  static _onLoadPreset(event, target) {
    const presetSel = this.element.querySelector('#sqt-system-preset');
    if (presetSel) this._fillFromPreset(presetSel.value);
  }

  static _onAddCurrency(event, target) {
    const container = this.element.querySelector('#sqt-currency-list');
    if (container) container.appendChild(this._buildCurrencyRow());
  }

  static _onRemoveCurrency(event, target) {
    target.closest('.sqt-currency-row')?.remove();
  }

  static _onPreviewTheme(event, target) {
    const themeId = this.element.querySelector('#sqt-theme-select')?.value;
    if (themeId) ThemeManager.apply(themeId);
  }
}
