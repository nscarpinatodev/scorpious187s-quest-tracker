import { MODULE_ID, SETTINGS } from './constants.js';
import { getThemeChoices } from './data/theme-presets.js';
import { detectSystemPreset } from './data/system-presets.js';

export function registerSettings() {

  // ── Quest Data (world) ──────────────────────────────────────────────────
  game.settings.register(MODULE_ID, SETTINGS.QUESTS, {
    name: 'Quest Data',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      // Fires on ALL clients (including players) when the GM saves quest data.
      // Use this to drive cross-client UI refreshes instead of a custom socket.
      Hooks.callAll('sqt.questDataRefresh');
    },
  });

  // ── System Configuration (world) ────────────────────────────────────────
  game.settings.register(MODULE_ID, SETTINGS.SYSTEM_CONFIG, {
    name: 'System Configuration',
    scope: 'world',
    config: false,
    type: Object,
    default: {
      preset: detectSystemPreset(),
      xpEnabled: true,
      currencyEnabled: true,
      currency: [],
      minObjectiveRole: 1,
      dragPermission: 'gm',
    },
    onChange: () => Hooks.callAll('sqt.systemConfigChanged'),
  });

  // ── Active Theme (world) — GM-controlled, propagates to all clients ────
  game.settings.register(MODULE_ID, SETTINGS.THEME, {
    name: game.i18n.localize('QUESTTRACKER.Settings.Theme.SelectTheme'),
    hint: 'Visual theme for the quest tracker.',
    scope: 'world',
    config: false,
    type: String,
    default: 'fantasy-parchment',
    onChange: (value) => {
      Hooks.callAll('sqt.themeChanged', value);
    },
  });

  // ── Custom Theme Variables (client) ─────────────────────────────────────
  game.settings.register(MODULE_ID, SETTINGS.CUSTOM_THEME, {
    name: 'Custom Theme Variables',
    scope: 'client',
    config: false,
    type: Object,
    default: {},
  });

  // ── Tracker Window Position (client) ────────────────────────────────────
  game.settings.register(MODULE_ID, SETTINGS.TRACKER_POSITION, {
    name: 'Tracker Position',
    scope: 'client',
    config: false,
    type: Object,
    default: { left: 120, top: 120, width: 700, height: 600 },
  });

  // ── Notification Preferences (client) ───────────────────────────────────
  game.settings.register(MODULE_ID, SETTINGS.NOTIFICATIONS, {
    name: 'Notification Preferences',
    scope: 'client',
    config: false,
    type: Object,
    default: {
      questNoteEnabled: true,
      autoShowTracker: false,
    },
  });

  // ── Settings Menu Button ─────────────────────────────────────────────────
  game.settings.registerMenu(MODULE_ID, 'systemConfig', {
    name: game.i18n.localize('QUESTTRACKER.Settings.Title'),
    label: game.i18n.localize('QUESTTRACKER.Settings.Title'),
    hint: 'Configure system presets, currency, XP, and notification settings.',
    icon: 'fas fa-cog',
    type: SystemConfigApp,
    restricted: true,
  });
}

// Avoid circular import — the app class is registered after its file is loaded
let SystemConfigApp;
export function setSystemConfigApp(cls) {
  SystemConfigApp = cls;
}
