export const MODULE_ID = 'scorpious-quest-tracker';
export const MODULE_TITLE = 'Scorpious Quest Tracker';
export const SOCKET_NAME = `module.${MODULE_ID}`;

export const QUEST_STATUS = Object.freeze({
  INACTIVE:  'inactive',
  AVAILABLE: 'available',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  FAILED:    'failed',
});

export const QUEST_STATUS_ICONS = Object.freeze({
  inactive:  'fas fa-eye-slash',
  available: 'fas fa-map-marker-alt',
  active:    'fas fa-running',
  completed: 'fas fa-check-circle',
  failed:    'fas fa-times-circle',
});

export const QUEST_STATUS_COLORS = Object.freeze({
  inactive:  '#888888',
  available: '#5588cc',
  active:    '#55aa55',
  completed: '#aa7722',
  failed:    '#aa3333',
});

export const DROP_TYPES = Object.freeze({
  QUESTGIVER: 'questgiver',
  LOCATION:   'location',
  REWARD_ITEM: 'reward-item',
  JOURNAL:    'journal',
});

export const SOCKET_TYPES = Object.freeze({
  QUEST_NOTE:     'questNote',
  QUEST_UPDATED:  'questUpdated',
  QUEST_DELETED:  'questDeleted',
  REFRESH:        'refresh',
});

export const SETTINGS = Object.freeze({
  QUESTS:           'quests',
  SYSTEM_CONFIG:    'systemConfig',
  THEME:            'theme',
  CUSTOM_THEME:     'customTheme',
  TRACKER_POSITION: 'trackerPosition',
  NOTIFICATIONS:    'notifications',
});

export const DEFAULT_QUEST_IMG = 'icons/svg/book.svg';
export const DEFAULT_ACTOR_IMG = 'icons/svg/mystery-man.svg';
