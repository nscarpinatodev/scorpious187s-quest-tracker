import { MODULE_ID, QUEST_STATUS, QUEST_STATUS_ICONS, SETTINGS, SOCKET_TYPES } from '../constants.js';
import { QuestStore } from '../data/quest-store.js';
import { ThemeManager } from '../theme-manager.js';
import { confirmDialog } from '../helpers.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class QuestTrackerApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @type {QuestTrackerApp|null} */
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: 'sqt-tracker',
    classes: ['sqt-window', 'sqt-tracker'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      title: 'QUESTTRACKER.Title',
      icon: 'fas fa-scroll',
      minimizable: true,
      resizable: true,
    },
    position: { width: 1139, height: 695 },
    actions: {
      createQuest:   QuestTrackerApp._onCreateQuest,
      openQuest:     QuestTrackerApp._onOpenQuest,
      deleteQuest:   QuestTrackerApp._onDeleteQuest,
      completeQuest: QuestTrackerApp._onCompleteQuest,
      failQuest:     QuestTrackerApp._onFailQuest,
      reactivate:    QuestTrackerApp._onReactivate,
      makeAvailable: QuestTrackerApp._onMakeAvailable,
      sendQuestNote: QuestTrackerApp._onSendQuestNote,
      openSettings:  QuestTrackerApp._onOpenSettings,
    },
  };

  static PARTS = {
    tracker: {
      template: `modules/${MODULE_ID}/templates/quest-tracker.hbs`,
      scrollable: ['.sqt-tab-content.active'],
    },
  };

  /** Active tab key */
  _activeTab = QUEST_STATUS.ACTIVE;

  constructor(options = {}) {
    super(options);
    QuestTrackerApp.instance = this;
  }

  /** Open or bring-to-front the singleton tracker. */
  static open() {
    if (QuestTrackerApp.instance?.rendered) {
      QuestTrackerApp.instance.bringToFront();
      return QuestTrackerApp.instance;
    }
    const app = new QuestTrackerApp();
    app.render(true);
    return app;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const isGM = game.user.isGM;
    const themeId = game.settings.get(MODULE_ID, SETTINGS.THEME);

    const allQuests = QuestStore.list();

    const tabs = [
      { id: QUEST_STATUS.INACTIVE,  icon: QUEST_STATUS_ICONS.inactive,  gmOnly: true },
      { id: QUEST_STATUS.AVAILABLE, icon: QUEST_STATUS_ICONS.available,  gmOnly: false },
      { id: QUEST_STATUS.ACTIVE,    icon: QUEST_STATUS_ICONS.active,     gmOnly: false },
      { id: QUEST_STATUS.COMPLETED, icon: QUEST_STATUS_ICONS.completed,  gmOnly: false },
      { id: QUEST_STATUS.FAILED,    icon: QUEST_STATUS_ICONS.failed,     gmOnly: false },
    ].filter(t => isGM || !t.gmOnly);

    const questsByStatus = {};
    for (const tab of tabs) {
      questsByStatus[tab.id] = allQuests
        .filter(q => q.status === tab.id)
        .map(q => this._enrichQuest(q));
    }

    return {
      ...ctx,
      isGM,
      themeId,
      activeTab: this._activeTab,
      tabs,
      questsByStatus,
      statusIcons: QUEST_STATUS_ICONS,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    ThemeManager.applyToElement(this.element, context.themeId);
    this._activateTabListeners();
    this._applyActiveTab(this._activeTab);

    // Re-render on quest data changes — guard against duplicate registration on re-renders
    if (!this._hookId_questCreated) {
      this._hookId_questCreated   = Hooks.on('sqt.questCreated',     () => this.render());
      this._hookId_questUpdated   = Hooks.on('sqt.questUpdated',     () => this.render());
      this._hookId_questDeleted   = Hooks.on('sqt.questDeleted',     () => this.render());
      this._hookId_dataRefresh    = Hooks.on('sqt.questDataRefresh', () => this.render());
      this._hookId_themeChanged   = Hooks.on('sqt.themeChanged', (id) => ThemeManager.applyToElement(this.element, id));
    }
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off('sqt.questCreated',     this._hookId_questCreated);
    Hooks.off('sqt.questUpdated',     this._hookId_questUpdated);
    Hooks.off('sqt.questDeleted',     this._hookId_questDeleted);
    Hooks.off('sqt.questDataRefresh', this._hookId_dataRefresh);
    Hooks.off('sqt.themeChanged',     this._hookId_themeChanged);
    this._hookId_questCreated = null;
    this._hookId_questUpdated = null;
    this._hookId_questDeleted = null;
    this._hookId_dataRefresh  = null;
    this._hookId_themeChanged = null;
    QuestTrackerApp.instance = null;
  }

  // ── Tab handling ─────────────────────────────────────────────────────────

  _activateTabListeners() {
    this.element.querySelectorAll('.sqt-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) this._applyActiveTab(tab);
      });
    });
  }

  _applyActiveTab(tabId) {
    this._activeTab = tabId;
    this.element.querySelectorAll('.sqt-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    this.element.querySelectorAll('.sqt-tab-content').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.tab === tabId);
    });
  }

  // ── Data helpers ─────────────────────────────────────────────────────────

  _enrichQuest(quest) {
    return {
      ...quest,
      statusIcon:  QUEST_STATUS_ICONS[quest.status] ?? 'fas fa-question',
      thumbnail:   quest.img || quest.questgiver?.img || 'icons/svg/book.svg',
      hasRewards:  quest.rewards?.xp > 0 ||
                   Object.values(quest.rewards?.currency ?? {}).some(v => v > 0) ||
                   quest.rewards?.items?.length > 0,
    };
  }

  // ── Static action handlers ───────────────────────────────────────────────

  static async _onCreateQuest(event, target) {
    const quest = await QuestStore.create({
      name: game.i18n.localize('QUESTTRACKER.Quest.Name'),
      status: QUEST_STATUS.INACTIVE,
    });
    const { QuestSheetApp } = await import('./quest-sheet.js');
    new QuestSheetApp(quest.id).render(true);
  }

  static async _onOpenQuest(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (!id) return;
    const { QuestSheetApp } = await import('./quest-sheet.js');
    new QuestSheetApp(id).render(true);
  }

  static async _onDeleteQuest(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (!id) return;
    const quest = QuestStore.get(id);
    if (!quest) return;
    const confirmed = await confirmDialog(
      game.i18n.localize('QUESTTRACKER.Confirm.DeleteQuest'),
      game.i18n.format('QUESTTRACKER.Confirm.DeleteQuestMessage', { name: quest.name }),
    );
    if (confirmed) await QuestStore.delete(id);
  }

  static async _onCompleteQuest(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (!id) return;
    const quest = QuestStore.get(id);
    if (!quest) return;
    const confirmed = await confirmDialog(
      game.i18n.localize('QUESTTRACKER.Confirm.CompleteQuest'),
      game.i18n.format('QUESTTRACKER.Confirm.CompleteQuestMessage', { name: quest.name }),
    );
    if (!confirmed) return;
    await QuestStore.setStatus(id, QUEST_STATUS.COMPLETED);
    const { RewardDialog } = await import('./reward-dialog.js');
    new RewardDialog(id).render(true);
  }

  static async _onFailQuest(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (!id) return;
    const quest = QuestStore.get(id);
    if (!quest) return;
    const confirmed = await confirmDialog(
      game.i18n.localize('QUESTTRACKER.Confirm.FailQuest'),
      game.i18n.format('QUESTTRACKER.Confirm.FailQuestMessage', { name: quest.name }),
    );
    if (confirmed) await QuestStore.setStatus(id, QUEST_STATUS.FAILED);
  }

  static async _onReactivate(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (id) await QuestStore.setStatus(id, QUEST_STATUS.ACTIVE);
  }

  static async _onMakeAvailable(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (id) await QuestStore.setStatus(id, QUEST_STATUS.AVAILABLE);
  }

  static async _onSendQuestNote(event, target) {
    const id = target.closest('[data-quest-id]')?.dataset.questId;
    if (!id) return;
    const quest      = QuestStore.get(id);
    const noteOptions = { type: 'quest', status: quest?.status };
    game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPES.QUEST_NOTE, questId: id, noteOptions });
    const { QuestNoteApp } = await import('./quest-note.js');
    QuestNoteApp.show(id, noteOptions);
  }

  static async _onOpenSettings(event, target) {
    const { SystemConfigApp } = await import('./system-config.js');
    new SystemConfigApp().render(true);
  }
}
