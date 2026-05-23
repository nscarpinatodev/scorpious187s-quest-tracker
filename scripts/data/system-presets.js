/**
 * System-specific reward configuration presets.
 * Each preset defines how to read/write XP and currency on actors.
 */

export const SYSTEM_PRESETS = {
  custom: {
    id: 'custom',
    label: 'Custom / System Agnostic',
    xpEnabled: false,
    currencyEnabled: false,
    currency: [],
    xpPath: null,
    currencyPath: null,
    applyXP: null,
    applyCurrency: null,
  },

  dnd5e: {
    id: 'dnd5e',
    label: 'D&D 5th Edition',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'pp', label: 'Platinum', conversion: 10 },
      { key: 'gp', label: 'Gold',     conversion: 1  },
      { key: 'ep', label: 'Electrum', conversion: 0.5 },
      { key: 'sp', label: 'Silver',   conversion: 0.1 },
      { key: 'cp', label: 'Copper',   conversion: 0.01 },
    ],
    xpPath: 'system.details.xp.value',
    currencyPath: 'system.currency',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.details.xp.value') ?? 0;
      await actor.update({ 'system.details.xp.value': current + amount });
    },
    async applyCurrency(actor, currency) {
      const update = {};
      for (const [key, amount] of Object.entries(currency)) {
        if (!amount) continue;
        const current = foundry.utils.getProperty(actor, `system.currency.${key}`) ?? 0;
        update[`system.currency.${key}`] = current + amount;
      }
      if (Object.keys(update).length) await actor.update(update);
    },
  },

  pf2e: {
    id: 'pf2e',
    label: 'Pathfinder 2e',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'pp', label: 'Platinum', conversion: 10 },
      { key: 'gp', label: 'Gold',     conversion: 1  },
      { key: 'sp', label: 'Silver',   conversion: 0.1 },
      { key: 'cp', label: 'Copper',   conversion: 0.01 },
    ],
    xpPath: 'system.details.xp.value',
    currencyPath: 'system.currency',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.details.xp.value') ?? 0;
      await actor.update({ 'system.details.xp.value': current + amount });
    },
    async applyCurrency(actor, currency) {
      const coins = {};
      for (const [key, amount] of Object.entries(currency)) {
        if (!amount) continue;
        coins[key] = amount;
      }
      if (!Object.keys(coins).length) return;
      // PF2e v5+ stores currency as inventory coin items; use addCoins when available.
      if (typeof actor.inventory?.addCoins === 'function') {
        await actor.inventory.addCoins(coins);
      } else {
        const update = {};
        for (const [key, amount] of Object.entries(coins)) {
          const current = foundry.utils.getProperty(actor, `system.currency.${key}.value`) ?? 0;
          update[`system.currency.${key}.value`] = current + amount;
        }
        if (Object.keys(update).length) await actor.update(update);
      }
    },
  },

  sw5e: {
    id: 'sw5e',
    label: 'SW5e (Star Wars 5e)',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'gc', label: 'Galaxy Credits', conversion: 1 },
    ],
    xpPath: 'system.details.xp.value',
    currencyPath: 'system.currency',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.details.xp.value') ?? 0;
      await actor.update({ 'system.details.xp.value': current + amount });
    },
    async applyCurrency(actor, currency) {
      const update = {};
      for (const [key, amount] of Object.entries(currency)) {
        if (!amount) continue;
        const current = foundry.utils.getProperty(actor, `system.currency.${key}`) ?? 0;
        update[`system.currency.${key}`] = current + amount;
      }
      if (Object.keys(update).length) await actor.update(update);
    },
  },

  pf1: {
    id: 'pf1',
    label: 'Pathfinder 1e',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'pp', label: 'Platinum', conversion: 10 },
      { key: 'gp', label: 'Gold',     conversion: 1  },
      { key: 'sp', label: 'Silver',   conversion: 0.1 },
      { key: 'cp', label: 'Copper',   conversion: 0.01 },
    ],
    xpPath: 'system.details.xp.value',
    currencyPath: 'system.currency',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.details.xp.value') ?? 0;
      await actor.update({ 'system.details.xp.value': current + amount });
    },
    async applyCurrency(actor, currency) {
      const update = {};
      for (const [key, amount] of Object.entries(currency)) {
        if (!amount) continue;
        const current = foundry.utils.getProperty(actor, `system.currency.${key}.value`) ?? 0;
        update[`system.currency.${key}.value`] = current + amount;
      }
      if (Object.keys(update).length) await actor.update(update);
    },
  },

  wfrp4e: {
    id: 'wfrp4e',
    label: 'Warhammer Fantasy RPG 4e',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'gc',  label: 'Gold Crowns',   conversion: 240 },
      { key: 'ss',  label: 'Silver Shillings', conversion: 12 },
      { key: 'bp',  label: 'Brass Pennies',  conversion: 1 },
    ],
    xpPath: 'system.details.experience.total',
    currencyPath: 'system.currency',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.details.experience.total') ?? 0;
      await actor.update({ 'system.details.experience.total': current + amount });
    },
    async applyCurrency(actor, currency) {
      const update = {};
      for (const [key, amount] of Object.entries(currency)) {
        if (!amount) continue;
        const current = foundry.utils.getProperty(actor, `system.currency.${key}`) ?? 0;
        update[`system.currency.${key}`] = current + amount;
      }
      if (Object.keys(update).length) await actor.update(update);
    },
  },

  shadowrun5e: {
    id: 'shadowrun5e',
    label: 'Shadowrun 5e',
    xpEnabled: true,
    currencyEnabled: true,
    currency: [
      { key: 'nuyen', label: 'Nuyen', conversion: 1 },
    ],
    xpPath: 'system.karma.value',
    currencyPath: 'system.nuyen',
    async applyXP(actor, amount) {
      const current = foundry.utils.getProperty(actor, 'system.karma.value') ?? 0;
      await actor.update({ 'system.karma.value': current + amount });
    },
    async applyCurrency(actor, currency) {
      if (!currency.nuyen) return;
      const current = foundry.utils.getProperty(actor, 'system.nuyen') ?? 0;
      await actor.update({ 'system.nuyen': current + currency.nuyen });
    },
  },
};

export function getSystemPreset(id) {
  return SYSTEM_PRESETS[id] ?? SYSTEM_PRESETS.custom;
}

export function getSystemPresetList() {
  return Object.values(SYSTEM_PRESETS).map(p => ({ id: p.id, label: p.label }));
}

/**
 * Auto-detect the system and return the matching preset ID.
 */
export function detectSystemPreset() {
  const systemId = game.system?.id;
  if (systemId && SYSTEM_PRESETS[systemId]) return systemId;
  return 'custom';
}
