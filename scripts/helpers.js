import { MODULE_ID } from './constants.js';
import { SqtConfirmDialog } from './apps/confirm-dialog.js';

/** Register Handlebars helpers used by SQT templates. */
export function registerHandlebarsHelpers() {
  Handlebars.registerHelper('sqt-eq',  (a, b) => a === b);
  Handlebars.registerHelper('sqt-ne',  (a, b) => a !== b);
  Handlebars.registerHelper('sqt-or',  (a, b) => a || b);
  Handlebars.registerHelper('sqt-and', (a, b) => a && b);
  Handlebars.registerHelper('sqt-not', (a) => !a);
  Handlebars.registerHelper('sqt-gt',  (a, b) => a > b);
  Handlebars.registerHelper('sqt-gte', (a, b) => a >= b);

  // Only register concat if Foundry hasn't already
  if (!Handlebars.helpers['concat']) {
    Handlebars.registerHelper('concat', (...args) => {
      args.pop(); // remove Handlebars options hash
      return args.join('');
    });
  }

  Handlebars.registerHelper('sqt-json', (v) => JSON.stringify(v));

  Handlebars.registerHelper('sqt-img-or', (img, fallback) =>
    (img && img !== 'icons/svg/book.svg') ? img : fallback);

  Handlebars.registerHelper('sqt-currency-label', (key, currencyDef) => {
    const entry = (currencyDef ?? []).find(c => c.key === key);
    return entry?.label ?? key.toUpperCase();
  });

  Handlebars.registerHelper('sqt-localize-status', (status) =>
    game.i18n.localize(`QUESTTRACKER.Status.${status}`));
}

/** Pre-load all SQT Handlebars templates. */
export async function preloadTemplates() {
  const base = `modules/${MODULE_ID}/templates`;
  return loadTemplates([
    `${base}/quest-tracker.hbs`,
    `${base}/quest-sheet.hbs`,
    `${base}/quest-note.hbs`,
    `${base}/system-config.hbs`,
    `${base}/reward-dialog.hbs`,
    `${base}/confirm-dialog.hbs`,
  ]);
}

/** Resolve a UUID to its document (async). Returns null if not found. */
export async function resolveUuid(uuid) {
  if (!uuid) return null;
  try {
    return await fromUuid(uuid);
  } catch {
    return null;
  }
}

/** Get all player-controlled characters. */
export function getPartyActors() {
  return game.actors.filter(a =>
    a.hasPlayerOwner && a.type === 'character' && !a.isToken
  );
}

/** Format a number as a currency string. */
export function formatCurrency(amount, label) {
  if (!amount) return null;
  return `${amount} ${label}`;
}

/**
 * Show a confirmation dialog.
 * @param {string} title
 * @param {string} content
 * @returns {Promise<boolean>}
 */
export function confirmDialog(title, content) {
  return SqtConfirmDialog.confirm(title, content);
}

/** Truncate a string to maxLen characters. */
export function truncate(str, maxLen = 80) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/** Strip HTML tags from a string. */
export function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html ?? '';
  return tmp.textContent || '';
}
