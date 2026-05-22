import { MODULE_ID, SETTINGS } from '../constants.js';
import { QuestStore } from '../data/quest-store.js';
import { getSystemPreset } from '../data/system-presets.js';
import { getPartyActors } from '../helpers.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for distributing quest rewards to party members when a quest is completed.
 */
export class RewardDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'sqt-rewards',
    classes: ['sqt-window', 'sqt-rewards'],
    tag: 'div',
    window: {
      frame: true,
      positioned: true,
      title: 'QUESTTRACKER.Rewards.ApplyRewards',
      icon: 'fas fa-gift',
      minimizable: false,
      resizable: false,
    },
    position: { width: 520, height: 'auto' },
    actions: {
      applyRewards: RewardDialog._onApply,
      cancel:       RewardDialog._onCancel,
      toggleAll:    RewardDialog._onToggleAll,
    },
  };

  static PARTS = {
    dialog: {
      template: `modules/${MODULE_ID}/templates/reward-dialog.hbs`,
      scrollable: ['.sqt-actor-list'],
    },
  };

  /** @param {string} questId */
  constructor(questId, options = {}) {
    super(options);
    this.questId = questId;
  }

  async _prepareContext(options) {
    const ctx  = await super._prepareContext(options);
    const quest = QuestStore.get(this.questId);
    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);
    const currency  = sysConfig.currency?.length ? sysConfig.currency : (preset.currency ?? []);
    const xpEnabled = sysConfig.xpEnabled ?? preset.xpEnabled;
    const currencyEnabled = sysConfig.currencyEnabled ?? preset.currencyEnabled;

    const actors = getPartyActors().map(a => ({
      id:      a.id,
      name:    a.name,
      img:     a.img,
      checked: true,
    }));

    const rewardCurrency = Object.entries(quest?.rewards?.currency ?? {})
      .filter(([, v]) => v > 0)
      .map(([key, amount]) => ({
        key,
        amount,
        label: currency.find(c => c.key === key)?.label ?? key,
      }));

    return {
      ...ctx,
      quest,
      actors,
      xpEnabled,
      currencyEnabled,
      rewardCurrency,
      hasRewardItems:  (quest?.rewards?.items?.length ?? 0) > 0,
      xp:              quest?.rewards?.xp ?? 0,
      noActors:        actors.length === 0,
    };
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  static async _onApply(event, target) {
    const quest   = QuestStore.get(this.questId);
    if (!quest) return this.close();

    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);

    // Gather checked actors
    const checkedIds = new Set();
    this.element.querySelectorAll('.sqt-actor-check:checked').forEach(cb => {
      checkedIds.add(cb.dataset.actorId);
    });

    const actors = getPartyActors().filter(a => checkedIds.has(a.id));
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize('QUESTTRACKER.Rewards.NoActors'));
      return;
    }

    const splitCurrency = this.element.querySelector('#sqt-split-currency')?.checked ?? true;
    const xpEach        = this.element.querySelector('#sqt-xp-each')?.checked ?? true;

    const xp       = quest.rewards?.xp ?? 0;
    const currency = quest.rewards?.currency ?? {};
    const items    = quest.rewards?.items ?? [];

    const count = actors.length;

    for (const actor of actors) {
      // XP
      if (xp > 0 && preset.applyXP) {
        const share = xpEach ? xp : Math.floor(xp / count);
        if (share > 0) await preset.applyXP(actor, share).catch(console.error);
      }

      // Currency
      if (preset.applyCurrency) {
        const share = {};
        for (const [key, amount] of Object.entries(currency)) {
          if (!amount) continue;
          share[key] = splitCurrency ? Math.floor(amount / count) : amount;
        }
        if (Object.keys(share).length) await preset.applyCurrency(actor, share).catch(console.error);
      }

      // Items — give each actor a copy of each reward item
      for (const rewardItem of items) {
        const source = await fromUuid(rewardItem.uuid).catch(() => null);
        if (source) {
          const itemData = source.toObject();
          itemData.system = foundry.utils.mergeObject(itemData.system ?? {}, {});
          if (rewardItem.quantity && itemData.system.quantity !== undefined) {
            itemData.system.quantity = rewardItem.quantity;
          }
          await actor.createEmbeddedDocuments('Item', [itemData]).catch(console.error);
        }
      }
    }

    ui.notifications.info(
      game.i18n.format('QUESTTRACKER.Rewards.RewardsAppliedFull', {
        quest: quest.name,
        count,
      })
    );
    this.close();
  }

  static _onCancel(event, target) {
    this.close();
  }

  static _onToggleAll(event, target) {
    const allChecked = [...this.element.querySelectorAll('.sqt-actor-check')]
      .every(cb => cb.checked);
    this.element.querySelectorAll('.sqt-actor-check').forEach(cb => {
      cb.checked = !allChecked;
    });
  }
}
