/**
 * Scorpious Quest Tracker — main entry point
 * Foundry VTT v13/v14
 */

import { MODULE_ID, SOCKET_TYPES, SETTINGS } from './constants.js';
import { registerSettings, setSystemConfigApp } from './settings.js';
import { registerHandlebarsHelpers, preloadTemplates } from './helpers.js';
import { QuestStore } from './data/quest-store.js';
import { ThemeManager } from './theme-manager.js';
import { QuestTrackerApp } from './apps/quest-tracker.js';
import { QuestNoteApp } from './apps/quest-note.js';
import { SystemConfigApp } from './apps/system-config.js';

// ── Init ──────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  // Wire up the circular dependency in settings.js
  setSystemConfigApp(SystemConfigApp);

  registerSettings();
  registerHandlebarsHelpers();

  console.log(`${MODULE_ID} | Initialized`);
});

// ── Ready ─────────────────────────────────────────────────────────────────

// Local snapshots — used by players to detect transitions and show notifications.
let _questStatusCache    = {};
let _objectiveStateCache = {}; // key: "questId::objectiveId", value: completed boolean

Hooks.once('ready', async () => {
  await preloadTemplates();
  await QuestStore.migrate();
  ThemeManager.apply();

  // Re-apply theme on all clients whenever the world setting changes.
  Hooks.on('sqt.themeChanged', (id) => ThemeManager.apply(id));

  // Seed caches so the first questDataRefresh doesn't false-positive.
  _questStatusCache    = _buildStatusSnapshot();
  _objectiveStateCache = _buildObjectiveSnapshot();

  // Socket listener — all clients receive quest-related socket messages
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    switch (data.type) {
      case SOCKET_TYPES.QUEST_NOTE:
        // Manual "Send to Players" from the tracker — show on non-GM clients.
        if (!game.user.isGM) {
          QuestNoteApp.show(data.questId, data.noteOptions ?? {});
        }
        break;

      case SOCKET_TYPES.REFRESH:
        QuestTrackerApp.instance?.render();
        break;

      case SOCKET_TYPES.PLAYER_UPDATE: {
        // Player-initiated write — only the primary active GM executes it.
        if (!game.user.isGM) break;
        const firstGM = game.users.find(u => u.isGM && u.active);
        if (game.user.id !== firstGM?.id) break;
        // Validate sender has sufficient role for objective toggling
        const sender = game.users.get(data.userId);
        const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
        const minRole = sysConfig.minObjectiveRole ?? 1;
        if (!sender || sender.role < minRole) break;
        // Only objectives may be updated this way
        if (data.questId && Array.isArray(data.updates?.objectives)) {
          await QuestStore.update(data.questId, { objectives: data.updates.objectives });
        }
        break;
      }
    }
  });

  // On player clients: when quest data arrives (via settings onChange), compare
  // cached snapshots to detect status transitions and objective completions, then
  // fire the appropriate notification popup.
  Hooks.on('sqt.questDataRefresh', () => {
    if (game.user.isGM) return;
    const prefs = game.settings.get(MODULE_ID, SETTINGS.NOTIFICATIONS);
    if (!prefs.questNoteEnabled) return;

    const currentStatuses   = _buildStatusSnapshot();
    const currentObjectives = _buildObjectiveSnapshot();

    // ── Quest status notifications ──
    for (const [id, newStatus] of Object.entries(currentStatuses)) {
      const prevStatus = _questStatusCache[id];
      if (prevStatus !== undefined && prevStatus !== newStatus &&
          ['available', 'active', 'completed', 'failed'].includes(newStatus)) {
        QuestNoteApp.show(id, { type: 'quest', status: newStatus });
      }
    }

    // ── Objective notifications ──
    // Only fire for quests that are active or available (not completed/failed).
    // Three cases: new objective added, hidden objective revealed, objective completed.
    for (const [key, curr] of Object.entries(currentObjectives)) {
      const prev = _objectiveStateCache[key];
      const [questId, objectiveId] = key.split('::');
      const quest     = QuestStore.get(questId);
      const objective = quest?.objectives?.find(o => o.id === objectiveId);
      if (!objective || curr.hidden) continue;
      if (!(quest.status === 'available' || quest.status === 'active')) continue;

      if (prev === undefined) {
        // Newly added objective (not previously in cache at all)
        QuestNoteApp.show(questId, { type: 'objectiveNew', objectiveText: objective.text });
      } else if (prev.hidden === true && curr.hidden === false) {
        // Hidden objective revealed to players
        QuestNoteApp.show(questId, { type: 'objectiveNew', objectiveText: objective.text });
      } else if (prev.completed === false && curr.completed === true) {
        // Objective marked complete
        QuestNoteApp.show(questId, { type: 'objective', objectiveText: objective.text });
      }
    }

    _questStatusCache    = currentStatuses;
    _objectiveStateCache = currentObjectives;
  });

  // On GM clients: keep caches in sync (guards against role changes mid-session).
  Hooks.on('sqt.questUpdated', () => {
    if (game.user.isGM) {
      _questStatusCache    = _buildStatusSnapshot();
      _objectiveStateCache = _buildObjectiveSnapshot();
    }
    // Broadcast a refresh to other clients (multi-tab / multi-GM support).
    game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPES.REFRESH });
  });

  // Inject journal button now that the full UI is rendered
  _injectJournalButton();

  console.log(`${MODULE_ID} | Ready`);
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Returns a { [questId]: status } map of all current quests. */
function _buildStatusSnapshot() {
  const all = QuestStore.getAll();
  return Object.fromEntries(Object.entries(all).map(([id, q]) => [id, q.status]));
}

/** Returns a { "questId::objectiveId": { completed, hidden } } map of all current objectives. */
function _buildObjectiveSnapshot() {
  const all = QuestStore.getAll();
  const snap = {};
  for (const [questId, quest] of Object.entries(all)) {
    for (const obj of (quest.objectives ?? [])) {
      snap[`${questId}::${obj.id}`] = { completed: !!obj.completed, hidden: !!obj.hidden };
    }
  }
  return snap;
}

// ── Journal sidebar button ────────────────────────────────────────────────

/**
 * Inject the Quest Tracker button into the Journal Notes sidebar header.
 * Called from both render hooks and once on ready.
 */
function _injectJournalButton() {
  const journalEl = document.querySelector('#journal');
  if (!journalEl) return;
  if (journalEl.querySelector('.sqt-open-tracker')) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sqt-open-tracker';
  btn.title = game.i18n.localize('QUESTTRACKER.Open');
  btn.innerHTML = `<i class="fas fa-scroll"></i> ${game.i18n.localize('QUESTTRACKER.Title')}`;
  btn.addEventListener('click', () => QuestTrackerApp.open());

  // Find the existing action-buttons row, then insert our button AFTER it
  // as a sibling so it gets its own full-width row below Create Entry/Folder.
  const actionsRow = journalEl.querySelector('.header-actions')
    ?? journalEl.querySelector('.action-buttons');

  if (actionsRow) {
    actionsRow.insertAdjacentElement('afterend', btn);
  } else {
    // Fallback: append to the directory header
    const header = journalEl.querySelector('header.directory-header') ?? journalEl.querySelector('header');
    if (header) header.appendChild(btn);
  }
}

// Fire after the journal tab is (re-)rendered — covers both old Application
// and any renamed ApplicationV2 variant
Hooks.on('renderJournalDirectory', _injectJournalButton);

// Fallback: some v13 builds rename or restructure the sidebar tab class
Hooks.on('renderSidebarTab', (app) => {
  if (app.id === 'journal') _injectJournalButton();
});

// ── Export public API ──────────────────────────────────────────────────────

Hooks.once('ready', () => {
  game.modules.get(MODULE_ID).api = {
    QuestStore,
    QuestTrackerApp,
    QuestNoteApp,
    SystemConfigApp,
    ThemeManager,
    openTracker: () => QuestTrackerApp.open(),
    createQuest: (data) => QuestStore.create(data),
    getQuests:   () => QuestStore.list(),
    getQuest:    (id) => QuestStore.get(id),
  };
});
