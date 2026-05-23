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

  /**
   * @param {string} questId
   * @param {object} [noteOptions]
   * @param {'quest'|'objective'} [noteOptions.type]
   * @param {string}  [noteOptions.status]        - quest status for type:'quest'
   * @param {string}  [noteOptions.objectiveText] - objective text for type:'objective'
   */
  constructor(questId, noteOptions = {}, appOptions = {}) {
    super(appOptions);
    this.questId     = questId;
    this._noteOptions = noteOptions;
  }

  get quest() { return QuestStore.get(this.questId); }

  /** Show the note for a quest (respects user notification prefs). */
  static show(questId, noteOptions = {}) {
    const prefs = game.settings.get(MODULE_ID, SETTINGS.NOTIFICATIONS);
    if (!prefs.questNoteEnabled) return;
    return new QuestNoteApp(questId, noteOptions).render(true);
  }

  async _prepareContext(options) {
    const ctx   = await super._prepareContext(options);
    const quest  = this.quest;
    const themeId = game.settings.get(MODULE_ID, SETTINGS.THEME);
    const theme  = getTheme(themeId);

    const { type = 'quest', status, objectiveText } = this._noteOptions;

    const STATUS_LABELS = {
      available: 'QUESTTRACKER.QuestNote.NewQuestAvailable',
      active:    'QUESTTRACKER.QuestNote.QuestAccepted',
      completed: 'QUESTTRACKER.QuestNote.QuestCompleted',
      failed:    'QUESTTRACKER.QuestNote.QuestFailed',
    };

    const isObjectiveNote = type === 'objective' || type === 'objectiveNew';
    const noteLabel = type === 'objective'
      ? game.i18n.localize('QUESTTRACKER.QuestNote.ObjectiveCompleted')
      : type === 'objectiveNew'
        ? game.i18n.localize('QUESTTRACKER.QuestNote.NewObjective')
        : game.i18n.localize(STATUS_LABELS[status] ?? 'QUESTTRACKER.QuestNote.NewQuest');

    return {
      ...ctx,
      quest,
      themeId,
      noteStyle:     theme?.noteStyle ?? 'scroll',
      noteType:      type,
      isObjectiveNote,
      noteLabel,
      objectiveText,
      objectives:    !isObjectiveNote
        ? (quest?.objectives ?? []).filter(o => o.text && !o.hidden)
        : [],
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
