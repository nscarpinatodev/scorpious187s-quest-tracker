import { MODULE_ID, SETTINGS } from '../constants.js';
import { SYSTEM_PRESETS, getSystemPreset, getSystemPresetList } from '../data/system-presets.js';
import { THEME_CATEGORIES } from '../data/theme-presets.js';
import { ThemeManager } from '../theme-manager.js';

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
    position: { width: 680, height: 720 },
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

    return {
      ...ctx,
      sysConfig,
      themeId,
      customVars,
      notifPrefs,
      currency,
      systemPresets: getSystemPresetList(),
      themeCategories: THEME_CATEGORIES,
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
        preset:          el.querySelector('#sqt-system-preset')?.value ?? 'custom',
        xpEnabled:       el.querySelector('#sqt-xp-enabled')?.checked ?? false,
        currencyEnabled: el.querySelector('#sqt-currency-enabled')?.checked ?? false,
        currency,
      },
      theme:   el.querySelector('#sqt-theme-select')?.value,
      notifs: {
        questNoteEnabled: el.querySelector('#sqt-note-enabled')?.checked ?? true,
        autoShowTracker:  el.querySelector('#sqt-auto-tracker')?.checked ?? true,
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
      preset:          data.system.preset,
      xpEnabled:       data.system.xpEnabled,
      currencyEnabled: data.system.currencyEnabled,
      currency:        data.system.currency,
    });

    if (data.theme) {
      await game.settings.set(MODULE_ID, SETTINGS.THEME, data.theme);
    }

    await game.settings.set(MODULE_ID, SETTINGS.NOTIFICATIONS, data.notifs);
    await game.settings.set(MODULE_ID, SETTINGS.CUSTOM_THEME, data.customVars);

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
