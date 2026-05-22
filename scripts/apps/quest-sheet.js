import { MODULE_ID, QUEST_STATUS, DROP_TYPES, SETTINGS, DEFAULT_QUEST_IMG } from '../constants.js';
import { QuestStore } from '../data/quest-store.js';
import { ThemeManager } from '../theme-manager.js';
import { getSystemPreset } from '../data/system-presets.js';
import { resolveUuid, confirmDialog } from '../helpers.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class QuestSheetApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'sqt-sheet',
    classes: ['sqt-window', 'sqt-sheet'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      title: 'QUESTTRACKER.Quest.Name',
      icon: 'fas fa-scroll',
      minimizable: true,
      resizable: true,
    },
    position: { width: 680, height: 740 },
    actions: {
      saveQuest:        QuestSheetApp._onSave,
      cancel:           QuestSheetApp._onCancel,
      addObjective:     QuestSheetApp._onAddObjective,
      removeObjective:  QuestSheetApp._onRemoveObjective,
      toggleObjective:  QuestSheetApp._onToggleObjective,
      removeQuestgiver: QuestSheetApp._onRemoveQuestgiver,
      removeLocation:   QuestSheetApp._onRemoveLocation,
      removeJournal:    QuestSheetApp._onRemoveJournal,
      openJournal:      QuestSheetApp._onOpenJournal,
      removeRewardItem: QuestSheetApp._onRemoveRewardItem,
      pickImage:        QuestSheetApp._onPickImage,
    },
  };

  static PARTS = {
    sheet: {
      template: `modules/${MODULE_ID}/templates/quest-sheet.hbs`,
      scrollable: ['.sqt-sheet-body'],
    },
  };

  /** @param {string} questId */
  constructor(questId, options = {}) {
    super(options);
    this.questId = questId;
    this.id = `sqt-sheet-${questId}`;
  }

  get quest() { return QuestStore.get(this.questId); }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const quest = this.quest;
    if (!quest) return { ...ctx, missing: true };

    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);
    const currency  = sysConfig.currency?.length ? sysConfig.currency : (preset.currency ?? []);

    return {
      ...ctx,
      quest,
      isGM: game.user.isGM,
      themeId: game.settings.get(MODULE_ID, SETTINGS.THEME),
      statusOptions: Object.values(QUEST_STATUS).map(s => ({
        value: s,
        label: game.i18n.localize(`QUESTTRACKER.Status.${s}`),
        selected: quest.status === s,
      })),
      xpEnabled:       sysConfig.xpEnabled ?? preset.xpEnabled,
      currencyEnabled: sysConfig.currencyEnabled ?? preset.currencyEnabled,
      currency,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    ThemeManager.applyToElement(this.element, context.themeId);

    const el = this.element;

    // Drag-over / drop
    el.addEventListener('dragover', this._onDragOver.bind(this));
    el.addEventListener('drop',     this._onDrop.bind(this));

    // Auto-save on input changes (debounced)
    el.addEventListener('input',  foundry.utils.debounce(this._autoSave.bind(this), 600));
    el.addEventListener('change', foundry.utils.debounce(this._autoSave.bind(this), 200));

    // Rich-text editors
    this._activateEditors();

    // Re-render on external changes to this quest
    this._hookId = Hooks.on('sqt.questUpdated', (updated) => {
      if (updated.id === this.questId) this.render();
    });
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off('sqt.questUpdated', this._hookId);
  }

  // ── Auto-save ────────────────────────────────────────────────────────────

  async _autoSave() {
    const form = this.element.querySelector('form.sqt-sheet-form');
    if (!form) return;
    const data = this._getFormData(form);
    await QuestStore.update(this.questId, data);
  }

  _getFormData(form) {
    const fd = new FormDataExtended(form);
    const obj = fd.object;

    // Objectives come from the DOM
    const objectives = [];
    form.querySelectorAll('.sqt-objective-row').forEach(row => {
      const id    = row.dataset.objectiveId;
      const text  = row.querySelector('.sqt-obj-text')?.value ?? '';
      const done  = row.querySelector('.sqt-obj-check')?.checked ?? false;
      if (id) objectives.push({ id, text, completed: done });
    });

    // Currency
    const currency = {};
    form.querySelectorAll('.sqt-currency-input').forEach(input => {
      currency[input.dataset.key] = Number(input.value) || 0;
    });

    return {
      name:        obj.name      ?? this.quest.name,
      status:      obj.status    ?? this.quest.status,
      description: obj.description ?? this.quest.description,
      notes:       obj.notes     ?? this.quest.notes,
      objectives,
      'rewards.xp':       Number(obj['rewards.xp'])  || 0,
      'rewards.currency': currency,
    };
  }

  // ── Rich-text editors ────────────────────────────────────────────────────

  _activateEditors() {
    this.element.querySelectorAll('[data-edit]').forEach(el => {
      const field = el.dataset.edit;
      const content = foundry.utils.getProperty(this.quest, field) ?? '';
      // Use ProseMirror/TinyMCE via Foundry's TextEditor.create if available
      if (typeof TextEditor?.create === 'function') {
        TextEditor.create({
          target: el,
          content,
          save_onsavecallback: async (html) => {
            await QuestStore.update(this.questId, { [field]: html });
          },
        });
      }
    });
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  _onDragOver(event) {
    const zone = event.target.closest('[data-drop-zone]');
    if (!zone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('sqt-drop-hover');
  }

  async _onDrop(event) {
    // Remove hover state
    this.element.querySelectorAll('.sqt-drop-hover').forEach(el => el.classList.remove('sqt-drop-hover'));

    const zone = event.target.closest('[data-drop-zone]');
    if (!zone) return;
    event.preventDefault();

    let data;
    try {
      data = TextEditor.getDragEventData(event);
    } catch {
      return;
    }
    if (!data?.type) return;

    const zoneType = zone.dataset.dropZone;

    switch (zoneType) {
      case DROP_TYPES.QUESTGIVER:
        if (data.type === 'Actor') await this._dropQuestgiver(data);
        break;
      case DROP_TYPES.LOCATION:
        if (data.type === 'Scene') await this._dropLocation(data);
        break;
      case DROP_TYPES.REWARD_ITEM:
        if (data.type === 'Item') await this._dropRewardItem(data);
        break;
      case DROP_TYPES.JOURNAL:
        if (data.type === 'JournalEntry') await this._dropJournalEntry(data);
        break;
      default:
        // Flexible: try to detect intent from data type
        await this._dropFallback(data);
    }
  }

  async _dropQuestgiver(data) {
    const actor = await resolveUuid(data.uuid);
    if (!actor) return;
    await QuestStore.update(this.questId, {
      questgiver: { uuid: actor.uuid, name: actor.name, img: actor.img },
    });
    this.render();
  }

  async _dropLocation(data) {
    const scene = await resolveUuid(data.uuid);
    if (!scene) return;
    await QuestStore.update(this.questId, {
      location: { uuid: scene.uuid, name: scene.name, img: scene.background?.src ?? '' },
    });
    this.render();
  }

  async _dropRewardItem(data) {
    const item = await resolveUuid(data.uuid);
    if (!item) return;
    const quest = this.quest;
    const items = [...(quest.rewards?.items ?? [])];
    // Avoid duplicates from the same source
    if (!items.find(i => i.uuid === item.uuid)) {
      items.push({ uuid: item.uuid, name: item.name, img: item.img, quantity: 1 });
      await QuestStore.update(this.questId, { 'rewards.items': items });
      this.render();
    }
  }

  async _dropJournalEntry(data) {
    const journal = await resolveUuid(data.uuid);
    if (!journal) return;
    const entries = [...(this.quest.journalEntries ?? [])];
    if (!entries.find(e => e.uuid === journal.uuid)) {
      entries.push({ uuid: journal.uuid, name: journal.name });
      await QuestStore.update(this.questId, { journalEntries: entries });
      this.render();
    }
  }

  async _dropFallback(data) {
    if (data.type === 'Actor')        await this._dropQuestgiver(data);
    else if (data.type === 'Scene')   await this._dropLocation(data);
    else if (data.type === 'Item')    await this._dropRewardItem(data);
    else if (data.type === 'JournalEntry') await this._dropJournalEntry(data);
  }

  // ── Static action handlers ───────────────────────────────────────────────

  static async _onSave(event, target) {
    const form = this.element.querySelector('form.sqt-sheet-form');
    if (form) await this._autoSave();
    this.close();
  }

  static _onCancel(event, target) {
    this.close();
  }

  static async _onAddObjective(event, target) {
    const quest = this.quest;
    const objectives = [...(quest.objectives ?? [])];
    objectives.push({ id: foundry.utils.randomID(), text: '', completed: false });
    await QuestStore.update(this.questId, { objectives });
    this.render();
  }

  static async _onRemoveObjective(event, target) {
    const id = target.closest('[data-objective-id]')?.dataset.objectiveId;
    if (!id) return;
    const objectives = (this.quest.objectives ?? []).filter(o => o.id !== id);
    await QuestStore.update(this.questId, { objectives });
    this.render();
  }

  static async _onToggleObjective(event, target) {
    const id = target.closest('[data-objective-id]')?.dataset.objectiveId;
    if (!id) return;
    const objectives = (this.quest.objectives ?? []).map(o =>
      o.id === id ? { ...o, completed: !o.completed } : o
    );
    await QuestStore.update(this.questId, { objectives });
    // Don't full re-render — just update the visual state
    const row = target.closest('[data-objective-id]');
    if (row) row.classList.toggle('completed', objectives.find(o => o.id === id)?.completed);
  }

  static async _onRemoveQuestgiver(event, target) {
    await QuestStore.update(this.questId, { questgiver: null });
    this.render();
  }

  static async _onRemoveLocation(event, target) {
    await QuestStore.update(this.questId, { location: null });
    this.render();
  }

  static async _onRemoveJournal(event, target) {
    const uuid = target.closest('[data-journal-uuid]')?.dataset.journalUuid;
    if (!uuid) return;
    const entries = (this.quest.journalEntries ?? []).filter(e => e.uuid !== uuid);
    await QuestStore.update(this.questId, { journalEntries: entries });
    this.render();
  }

  static async _onOpenJournal(event, target) {
    const uuid = target.closest('[data-journal-uuid]')?.dataset.journalUuid;
    if (!uuid) return;
    const doc = await fromUuid(uuid).catch(() => null);
    if (doc) doc.sheet?.render(true);
  }

  static async _onRemoveRewardItem(event, target) {
    const uuid = target.closest('[data-item-uuid]')?.dataset.itemUuid;
    if (!uuid) return;
    const items = (this.quest.rewards?.items ?? []).filter(i => i.uuid !== uuid);
    await QuestStore.update(this.questId, { 'rewards.items': items });
    this.render();
  }

  static async _onPickImage(event, target) {
    const current = this.quest?.img ?? '';
    const fp = new FilePicker({
      type: 'image',
      current,
      callback: async (path) => {
        await QuestStore.update(this.questId, { img: path });
        this.render();
      },
    });
    fp.render(true);
  }
}
