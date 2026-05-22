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

Hooks.once('ready', async () => {
  await preloadTemplates();
  await QuestStore.migrate();
  ThemeManager.apply();

  // Socket listener — all clients receive quest-related socket messages
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    switch (data.type) {
      case SOCKET_TYPES.QUEST_NOTE:
        // Only show to non-GM players (GM sent it, so the GM already handles locally)
        if (!game.user.isGM) {
          QuestNoteApp.show(data.questId);
        }
        break;

      case SOCKET_TYPES.REFRESH:
        QuestTrackerApp.instance?.render();
        break;
    }
  });

  // React to quest data changes from other GM clients (e.g. multiple tabs)
  Hooks.on('sqt.questUpdated', () => {
    // Broadcast a refresh to all other clients so their tracker UIs update
    game.socket.emit(`module.${MODULE_ID}`, { type: SOCKET_TYPES.REFRESH });
  });

  // Auto-show tracker for player clients if setting is enabled and quests exist
  if (!game.user.isGM) {
    const prefs = game.settings.get(MODULE_ID, SETTINGS.NOTIFICATIONS);
    if (prefs.autoShowTracker) {
      const activeQuests = QuestStore.listByStatus('active');
      const availableQuests = QuestStore.listByStatus('available');
      if (activeQuests.length + availableQuests.length > 0) {
        QuestTrackerApp.open();
      }
    }
  }

  console.log(`${MODULE_ID} | Ready`);
});

// ── Scene Controls ────────────────────────────────────────────────────────

Hooks.on('getSceneControlButtons', (controls) => {
  const notes = controls.find(c => c.name === 'notes');
  if (!notes) return;

  notes.tools.push({
    name: 'sqt-tracker',
    title: game.i18n.localize('QUESTTRACKER.Open'),
    icon: 'fas fa-scroll',
    button: true,
    onClick: () => QuestTrackerApp.open(),
    visible: true,
  });
});

// ── Player HUD hint ───────────────────────────────────────────────────────

Hooks.on('renderSidebar', (app, html) => {
  // No-op — the scene control button is sufficient
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
