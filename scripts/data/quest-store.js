import { MODULE_ID, SETTINGS, QUEST_STATUS, DEFAULT_QUEST_IMG } from '../constants.js';

/**
 * Central data store for all quest objects.
 * Quests are persisted as a world-scope module setting.
 */
export class QuestStore {

  /** @returns {Record<string, object>} Map of questId → quest object */
  static getAll() {
    return game.settings.get(MODULE_ID, SETTINGS.QUESTS) ?? {};
  }

  /** @returns {object|undefined} */
  static get(id) {
    return QuestStore.getAll()[id];
  }

  /** @returns {object[]} All quests as array, sorted by sort then createdAt */
  static list() {
    return Object.values(QuestStore.getAll())
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.createdAt - b.createdAt);
  }

  /** @returns {object[]} */
  static listByStatus(status) {
    return QuestStore.list().filter(q => q.status === status);
  }

  /**
   * Create a new quest.
   * @param {Partial<object>} data
   * @returns {Promise<object>} The created quest
   */
  static async create(data = {}) {
    const id = foundry.utils.randomID();
    const quest = QuestStore._buildDefault(id, data);
    const all = QuestStore.getAll();
    all[id] = quest;
    await game.settings.set(MODULE_ID, SETTINGS.QUESTS, all);
    Hooks.callAll('sqt.questCreated', quest);
    return quest;
  }

  /**
   * Update an existing quest.
   * @param {string} id
   * @param {Partial<object>} updates
   * @returns {Promise<object>} The updated quest
   */
  static async update(id, updates) {
    const all = QuestStore.getAll();
    if (!all[id]) throw new Error(`Quest ${id} not found`);
    const prevStatus = all[id].status;
    all[id] = foundry.utils.mergeObject(all[id], updates, { inplace: false });
    all[id].updatedAt = Date.now();
    await game.settings.set(MODULE_ID, SETTINGS.QUESTS, all);
    Hooks.callAll('sqt.questUpdated', all[id]);
    const newStatus = all[id].status;
    if (newStatus !== prevStatus &&
        (newStatus === QUEST_STATUS.AVAILABLE || newStatus === QUEST_STATUS.ACTIVE)) {
      Hooks.callAll('sqt.questBecameVisible', id, newStatus);
    }
    return all[id];
  }

  /**
   * Delete a quest.
   * @param {string} id
   */
  static async delete(id) {
    const all = QuestStore.getAll();
    const quest = all[id];
    if (!quest) return;
    delete all[id];
    await game.settings.set(MODULE_ID, SETTINGS.QUESTS, all);
    Hooks.callAll('sqt.questDeleted', id, quest);
  }

  /**
   * Set quest status with special handling for transitions.
   * @param {string} id
   * @param {string} status
   */
  static async setStatus(id, status) {
    const updates = { status };
    if (status === QUEST_STATUS.COMPLETED) updates.completedAt = Date.now();
    if (status === QUEST_STATUS.FAILED) updates.failedAt = Date.now();
    return QuestStore.update(id, updates);
  }

  /** Build a fully-defaulted quest object */
  static _buildDefault(id, overrides = {}) {
    return foundry.utils.mergeObject({
      id,
      name: game.i18n.localize('QUESTTRACKER.Quest.Name'),
      status: QUEST_STATUS.INACTIVE,
      description: '',
      objectives: [],
      notes: '',
      img: DEFAULT_QUEST_IMG,
      questgiver: null,
      location: null,
      journalEntries: [],
      rewards: {
        xp: 0,
        currency: {},
        items: [],
      },
      sort: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
      failedAt: null,
    }, overrides, { inplace: false });
  }

  /** Migrate legacy data structures if needed */
  static async migrate() {
    const all = QuestStore.getAll();
    let dirty = false;
    for (const [id, quest] of Object.entries(all)) {
      if (!quest.rewards) {
        quest.rewards = { xp: 0, currency: {}, items: [] };
        dirty = true;
      }
      if (!quest.objectives) {
        quest.objectives = [];
        dirty = true;
      }
      if (!quest.journalEntries) {
        quest.journalEntries = [];
        dirty = true;
      }
    }
    if (dirty) await game.settings.set(MODULE_ID, SETTINGS.QUESTS, all);
  }
}
