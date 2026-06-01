import { MODULE_ID, QUEST_STATUS, DROP_TYPES, SETTINGS, SOCKET_TYPES, DEFAULT_QUEST_IMG } from '../constants.js';
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
    position: { width: 946, height: 1030 },
    actions: {
      saveQuest:        QuestSheetApp._onSave,
      cancel:           QuestSheetApp._onCancel,
      deleteQuest:      QuestSheetApp._onDeleteQuest,
      addObjective:          QuestSheetApp._onAddObjective,
      removeObjective:       QuestSheetApp._onRemoveObjective,
      toggleObjective:       QuestSheetApp._onToggleObjective,
      toggleObjectiveHidden: QuestSheetApp._onToggleObjectiveHidden,
      removeQuestgiver: QuestSheetApp._onRemoveQuestgiver,
      removeLocation:   QuestSheetApp._onRemoveLocation,
      removeJournal:    QuestSheetApp._onRemoveJournal,
      openJournal:      QuestSheetApp._onOpenJournal,
      removeRewardItem: QuestSheetApp._onRemoveRewardItem,
      pickImage:        QuestSheetApp._onPickImage,
      rollLootRoller:   QuestSheetApp._onRollLootRoller,
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
    super({ ...options, id: `sqt-sheet-${questId}` });
    this.questId = questId;
  }

  get quest() { return QuestStore.get(this.questId); }

  get title() {
    return this.quest?.name ?? game.i18n.localize('QUESTTRACKER.Quest.Name');
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const quest = this.quest;
    if (!quest) return { ...ctx, missing: true };

    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);
    const currency  = sysConfig.currency?.length ? sysConfig.currency : (preset.currency ?? []);

    const minObjectiveRole = sysConfig.minObjectiveRole ?? 1;
    const canToggleObjective = game.user.isGM || game.user.role >= minObjectiveRole;

    const dragPermission = sysConfig.dragPermission ?? 'gm';
    const canDrop = game.user.isGM
      || dragPermission === 'player'
      || (dragPermission === 'trusted' && game.user.role >= CONST.USER_ROLES.TRUSTED);

    // Resolve journal entries and enrich their text pages for inline display
    const journalContent = [];
    for (const entry of quest.journalEntries ?? []) {
      const doc = await fromUuid(entry.uuid).catch(() => null);
      if (!doc) continue;
      const pages = doc.pages?.contents ?? [];
      const enrichedPages = [];
      for (const page of pages) {
        if (page.type === 'text') {
          const raw  = page.text?.content ?? '';
          const html = await TextEditor.enrichHTML(raw, { async: true });
          enrichedPages.push({
            uuid:       page.uuid,
            name:       page.name,
            content:    html,   // enriched — for player read-only view
            rawContent: raw,    // source HTML — seeded into the GM editor
          });
        }
      }
      if (enrichedPages.length) {
        journalContent.push({ uuid: entry.uuid, name: entry.name, pages: enrichedPages });
      }
    }

    const lootRollerActive = !!(game.modules.get('loot-roller')?.active)
      && typeof window.LootRoller?.openQuestRewards === 'function';

    return {
      ...ctx,
      quest,
      isGM: game.user.isGM,
      lootRollerActive,
      themeId: game.settings.get(MODULE_ID, SETTINGS.THEME),
      statusOptions: Object.values(QUEST_STATUS).map(s => ({
        value: s,
        label: game.i18n.localize(`QUESTTRACKER.Status.${s}`),
        selected: quest.status === s,
      })),
      xpEnabled:          sysConfig.xpEnabled ?? preset.xpEnabled,
      currencyEnabled:    sysConfig.currencyEnabled ?? preset.currencyEnabled,
      currency,
      canToggleObjective,
      canDrop,
      journalContent,
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    ThemeManager.applyToElement(this.element, context.themeId);

    // Update window title bar to reflect the actual quest name (frame doesn't re-render on updates)
    const titleEl = this.element.querySelector('.window-title');
    if (titleEl) titleEl.textContent = this.title;

    // Spin up inline editors for linked journal pages (GM only)
    if (context.isGM) this._initJournalEditors().catch(console.error);

    // All listeners go on the persistent outer element — only register once.
    // Re-renders replace inner template content but this.element stays the same,
    // so these listeners survive re-renders without needing to be re-added.
    if (!this._hookId) {
      const el = this.element;

      el.addEventListener('dragover', this._onDragOver.bind(this));
      el.addEventListener('drop',     this._onDrop.bind(this));
      el.addEventListener('dblclick', this._onDblClick.bind(this));
      el.addEventListener('input',  foundry.utils.debounce(this._autoSave.bind(this), 600));
      el.addEventListener('change', foundry.utils.debounce(this._autoSave.bind(this), 200));

      // Only re-render for external quest changes, not our own auto-saves.
      this._hookId = Hooks.on('sqt.questUpdated', (updated) => {
        if (updated.id === this.questId && !this._saving) this.render();
      });
      // Fires on ALL clients (via settings onChange) — handles player-side updates.
      this._hookId_dataRefresh  = Hooks.on('sqt.questDataRefresh', () => {
        if (!this._saving) this.render();
      });
      this._hookId_themeChanged = Hooks.on('sqt.themeChanged', (id) => ThemeManager.applyToElement(this.element, id));
    }
  }

  _onClose(options) {
    super._onClose(options);
    Hooks.off('sqt.questUpdated',     this._hookId);
    Hooks.off('sqt.questDataRefresh', this._hookId_dataRefresh);
    Hooks.off('sqt.themeChanged',     this._hookId_themeChanged);
    this._hookId = null;
    this._hookId_dataRefresh  = null;
    this._hookId_themeChanged = null;
  }

  // ── Inline journal editors ───────────────────────────────────────────────

  /**
   * For each linked journal text page, replace the read-only placeholder with a
   * live ProseMirror editor. Changes are auto-saved back to the JournalEntryPage
   * document after a short debounce. Runs after every render; existing editors
   * are destroyed and recreated because HandlebarsApplicationMixin replaces the DOM.
   */
  async _initJournalEditors() {
    await customElements.whenDefined('prose-mirror');

    const saveToPage = foundry.utils.debounce(async (pageUuid, content) => {
      const page = await fromUuid(pageUuid).catch(() => null);
      if (page) await page.update({ 'text.content': content });
    }, 1200);

    for (const container of this.element.querySelectorAll('.sqt-journal-page-editor[data-page-uuid]')) {
      const pageUuid = container.dataset.pageUuid;

      // Raw HTML is stored in an inert <template> so Handlebars can emit it
      // without it being parsed or executed as live DOM.
      const rawContent = container.querySelector('template.sqt-pm-seed')?.innerHTML ?? '';

      const pmEl = document.createElement('prose-mirror');
      pmEl.setAttribute('toggled', 'false');
      pmEl.setAttribute('collaborate', 'false');
      container.replaceChildren(pmEl);

      // Wait one task for connectedCallback to initialise the editor, then set content.
      await new Promise(r => setTimeout(r, 0));
      pmEl.value = rawContent;

      pmEl.addEventListener('change', () => saveToPage(pageUuid, pmEl.value ?? ''));
    }
  }

  // ── Permission helpers ───────────────────────────────────────────────────

  _canDrop() {
    if (game.user.isGM) return true;
    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const perm = sysConfig.dragPermission ?? 'gm';
    if (perm === 'player')  return true;
    if (perm === 'trusted') return game.user.role >= CONST.USER_ROLES.TRUSTED;
    return false;
  }

  // ── Double-click interactions ────────────────────────────────────────────

  async _onDblClick(event) {
    const questgiverEl = event.target.closest('.sqt-questgiver-zone .sqt-linked-entity');
    const locationEl   = event.target.closest('.sqt-location-zone .sqt-linked-entity');

    if (questgiverEl) {
      const uuid = this.quest?.questgiver?.uuid;
      if (!uuid) return;
      const actor = await fromUuid(uuid).catch(() => null);
      if (!actor) return;
      if (game.user.isGM) {
        actor.sheet?.render(true);
      } else {
        new ImagePopout(actor.img, { title: actor.name }).render(true);
      }
      return;
    }

    if (locationEl && game.user.isGM) {
      const uuid = this.quest?.location?.uuid;
      if (!uuid) return;
      const scene = await fromUuid(uuid).catch(() => null);
      if (scene) scene.view();
    }
  }

  // ── Auto-save ────────────────────────────────────────────────────────────

  async _autoSave() {
    if (!game.user.isGM) return; // World settings are GM-only; non-GMs use sockets
    const form = this.element.querySelector('form.sqt-sheet-form');
    if (!form) return;
    const data = this._getFormData(form);
    const prevStatus = this.quest?.status;
    this._saving = true;
    try {
      await QuestStore.update(this.questId, data);
    } finally {
      this._saving = false;
    }
    if (game.user.isGM &&
        data.status === QUEST_STATUS.COMPLETED &&
        prevStatus !== QUEST_STATUS.COMPLETED) {
      const { RewardDialog } = await import('./reward-dialog.js');
      new RewardDialog(this.questId).render(true);
    }
  }

  _getFormData(form) {
    const fd = new FormDataExtended(form);
    const obj = fd.object;

    // Build objectives from stored data, updating only what is present in the DOM.
    // Hidden objectives are not rendered for players — we preserve them from the store.
    // Players without toggle-permission don't get a checkbox — we preserve their completed state.
    const objectives = (this.quest?.objectives ?? []).map(o => {
      const row    = form.querySelector(`.sqt-objective-row[data-objective-id="${o.id}"]`);
      if (!row) return o; // Not in DOM (hidden from this user) — keep as-is
      const textEl = row.querySelector('.sqt-obj-text');
      const doneEl = row.querySelector('.sqt-obj-check');
      return {
        ...o,
        text:      textEl  ? textEl.value      : o.text,
        completed: doneEl  ? doneEl.checked     : o.completed,
      };
    });

    // Currency
    const currency = {};
    form.querySelectorAll('.sqt-currency-input').forEach(input => {
      currency[input.dataset.key] = Number(input.value) || 0;
    });

    // name and status live in the sheet header outside the <form>, so read them directly.
    const nameEl   = this.element.querySelector('input[name="name"]');
    const statusEl = this.element.querySelector('select[name="status"]');

    // Reward items — preserve all fields, just update quantity from the input
    const currentItems = this.quest.rewards?.items ?? [];
    const items = [];
    form.querySelectorAll('.sqt-item-row[data-item-uuid]').forEach(row => {
      const uuid = row.dataset.itemUuid;
      const existing = currentItems.find(i => i.uuid === uuid);
      if (existing) {
        const qty = Number(row.querySelector('.sqt-item-qty')?.value) || 1;
        items.push({ ...existing, quantity: qty });
      }
    });

    return {
      name:        nameEl?.value   ?? this.quest.name,
      status:      statusEl?.value ?? this.quest.status,
      description: obj.description ?? this.quest.description,
      notes:       obj.notes     ?? this.quest.notes,
      objectives,
      'rewards.xp':       Number(obj['rewards.xp'])  || 0,
      'rewards.currency': currency,
      'rewards.items':    items,
    };
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  _onDragOver(event) {
    if (!this._canDrop()) return;
    const zone = event.target.closest('[data-drop-zone]');
    if (!zone) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('sqt-drop-hover');
  }

  async _onDrop(event) {
    // Remove hover state
    this.element.querySelectorAll('.sqt-drop-hover').forEach(el => el.classList.remove('sqt-drop-hover'));
    if (!this._canDrop()) return;

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
    objectives.push({ id: foundry.utils.randomID(), text: '', completed: false, hidden: true });
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

  static async _onToggleObjectiveHidden(event, target) {
    const id = target.closest('[data-objective-id]')?.dataset.objectiveId;
    if (!id) return;
    const objectives = (this.quest.objectives ?? []).map(o =>
      o.id === id ? { ...o, hidden: !o.hidden } : o
    );
    await QuestStore.update(this.questId, { objectives });
    this.render();
  }

  static async _onToggleObjective(event, target) {
    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const minRole = sysConfig.minObjectiveRole ?? 1;
    if (!game.user.isGM && game.user.role < minRole) {
      target.checked = !target.checked; // revert visual change
      return;
    }
    const id = target.closest('[data-objective-id]')?.dataset.objectiveId;
    if (!id) return;
    const objectives = (this.quest.objectives ?? []).map(o =>
      o.id === id ? { ...o, completed: !o.completed } : o
    );
    if (game.user.isGM) {
      await QuestStore.update(this.questId, { objectives });
    } else {
      // Non-GMs cannot write world settings directly — ask the GM to save it
      game.socket.emit(`module.${MODULE_ID}`, {
        type:    SOCKET_TYPES.PLAYER_UPDATE,
        questId: this.questId,
        updates: { objectives },
        userId:  game.user.id,
      });
    }
    // Optimistic visual update — the GM's save will confirm via questDataRefresh
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

  static _onRollLootRoller(event, target) {
    window.LootRoller.openQuestRewards(async (items) => {
      const quest = this.quest;
      if (!quest || !items.length) return;
      const existing = quest.rewards?.items ?? [];
      const newItems = items
        .filter(item => item.uuid && !existing.find(e => e.uuid === item.uuid))
        .map(item => ({ uuid: item.uuid, name: item.name, img: item.img, quantity: 1 }));
      if (!newItems.length) return;
      this._saving = true;
      try {
        await QuestStore.update(this.questId, { 'rewards.items': [...existing, ...newItems] });
      } finally {
        this._saving = false;
      }
      this.render();
    });
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

  static async _onDeleteQuest(event, target) {
    const quest = this.quest;
    if (!quest) return;
    const confirmed = await confirmDialog(
      game.i18n.localize('QUESTTRACKER.Confirm.DeleteQuest'),
      game.i18n.format('QUESTTRACKER.Confirm.DeleteQuestMessage', { name: quest.name }),
    );
    if (confirmed) {
      await QuestStore.delete(this.questId);
      this.close();
    }
  }
}
