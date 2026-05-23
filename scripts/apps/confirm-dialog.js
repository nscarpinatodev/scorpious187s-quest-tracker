import { MODULE_ID, SETTINGS } from '../constants.js';
import { ThemeManager } from '../theme-manager.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SqtConfirmDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    classes: ['sqt-window', 'sqt-dialog'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      minimizable: false,
      resizable: false,
    },
    position: { width: 420, height: 'auto' },
    actions: {
      confirm: SqtConfirmDialog._onConfirm,
      cancel:  SqtConfirmDialog._onCancel,
    },
  };

  static PARTS = {
    dialog: {
      template: `modules/${MODULE_ID}/templates/confirm-dialog.hbs`,
    },
  };

  _resolve = null;
  _message = '';

  constructor(title, content, options = {}) {
    super({ ...options, window: { ...SqtConfirmDialog.DEFAULT_OPTIONS.window, title } });
    this._message = content;
  }

  get title() { return this.options.window?.title ?? 'Confirm'; }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    return {
      ...ctx,
      content: this._message,
      themeId: game.settings.get(MODULE_ID, SETTINGS.THEME),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    ThemeManager.applyToElement(this.element, context.themeId);
  }

  _onClose(options) {
    super._onClose(options);
    // Resolve false if closed via the X button
    this._resolve?.(false);
    this._resolve = null;
  }

  /** @returns {Promise<boolean>} */
  static confirm(title, content) {
    return new Promise(resolve => {
      const dialog = new SqtConfirmDialog(title, content);
      dialog._resolve = resolve;
      dialog.render(true);
    });
  }

  static _onConfirm(event, target) {
    this._resolve?.(true);
    this._resolve = null;
    this.close();
  }

  static _onCancel(event, target) {
    this._resolve?.(false);
    this._resolve = null;
    this.close();
  }
}
