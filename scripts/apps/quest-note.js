import { MODULE_ID, SETTINGS } from '../constants.js';
import { QuestStore } from '../data/quest-store.js';
import { ThemeManager } from '../theme-manager.js';
import { getTheme } from '../data/theme-presets.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The themed quest-notification popup shown to players when a quest becomes available.
 * Its visual style (scroll, datapad, hologram) is derived from the active theme.
 */
export class QuestNoteApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'sqt-note',
    classes: ['sqt-window', 'sqt-note'],
    tag: 'div',
    window: {
      frame: false,
      positioned: true,
      minimizable: false,
      resizable: false,
    },
    position: { width: 480, height: 'auto' },
    actions: {
      dismiss:     QuestNoteApp._onDismiss,
      viewTracker: QuestNoteApp._onViewTracker,
    },
  };

  static PARTS = {
    note: {
      template: `modules/${MODULE_ID}/templates/quest-note.hbs`,
    },
  };

  /** @param {string} questId */
  constructor(questId, options = {}) {
    super(options);
    this.questId = questId;
  }

  get quest() { return QuestStore.get(this.questId); }

  /** Show the note for a quest (respects user notification prefs). */
  static show(questId) {
    const prefs = game.settings.get(MODULE_ID, SETTINGS.NOTIFICATIONS);
    if (!prefs.questNoteEnabled) return;
    return new QuestNoteApp(questId).render(true);
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const quest = this.quest;
    const themeId = game.settings.get(MODULE_ID, SETTINGS.THEME);
    const theme = getTheme(themeId);

    return {
      ...ctx,
      quest,
      themeId,
      noteStyle: theme?.noteStyle ?? 'scroll',
      objectives: (quest?.objectives ?? []).filter(o => o.text),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const themeId = game.settings.get(MODULE_ID, SETTINGS.THEME);
    ThemeManager.applyToElement(this.element, themeId);

    // Position near center with a slight offset for stacking
    const offset = (document.querySelectorAll('.sqt-note').length - 1) * 20;
    this.setPosition({
      left: Math.round(window.innerWidth / 2 - 240 + offset),
      top:  Math.round(window.innerHeight / 3 + offset),
    });

    // Play entrance animation
    this.element.classList.add('sqt-note-enter');
    requestAnimationFrame(() => this.element.classList.add('sqt-note-visible'));
  }

  static async _onDismiss(event, target) {
    this.element.classList.remove('sqt-note-visible');
    this.element.classList.add('sqt-note-exit');
    setTimeout(() => this.close(), 400);
  }

  static async _onViewTracker(event, target) {
    const { QuestTrackerApp } = await import('./quest-tracker.js');
    QuestTrackerApp.open();
    this.close();
  }
}
