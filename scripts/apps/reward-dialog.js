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
      applyRewards:    RewardDialog._onApply,
      cancel:          RewardDialog._onCancel,
      toggleAll:       RewardDialog._onToggleAll,
      sendToLootRoller: RewardDialog._onSendToLootRoller,
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

    const rewardItems = (quest?.rewards?.items ?? []).map(i => ({
      uuid:     i.uuid,
      name:     i.name,
      img:      i.img || 'icons/svg/item-bag.svg',
      quantity: i.quantity ?? 1,
    }));

    const lootRollerActive = !!(game.modules.get('loot-roller')?.active)
      && typeof window.LootRoller?.startLottery === 'function';

    return {
      ...ctx,
      quest,
      actors,
      xpEnabled,
      currencyEnabled,
      rewardCurrency,
      rewardItems,
      hasRewardItems:   rewardItems.length > 0,
      xp:               quest?.rewards?.xp ?? 0,
      noActors:         actors.length === 0,
      lootRollerActive,
    };
  }

  // ── Action handlers ──────────────────────────────────────────────────────

  static async _onApply(event, target) {
    const quest = QuestStore.get(this.questId);
    if (!quest) return this.close();

    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);
    const currencyDef = sysConfig.currency?.length ? sysConfig.currency : (preset.currency ?? []);

    // Actors checked for XP + currency distribution
    const checkedIds = new Set();
    this.element.querySelectorAll('.sqt-actor-check:checked').forEach(cb => {
      checkedIds.add(cb.dataset.actorId);
    });
    const actors = getPartyActors().filter(a => checkedIds.has(a.id));
    if (!actors.length) {
      ui.notifications.warn(game.i18n.localize('QUESTTRACKER.Rewards.NoActors'));
      return;
    }

    const allPartyActors  = getPartyActors();
    const splitCurrency   = this.element.querySelector('#sqt-split-currency')?.checked ?? true;
    const xpEach          = this.element.querySelector('#sqt-xp-each')?.checked ?? true;
    const xp              = quest.rewards?.xp ?? 0;
    const currencies      = quest.rewards?.currency ?? {};
    const items           = quest.rewards?.items ?? [];
    const count           = actors.length;

    // Track what each party actor actually received for the chat card
    const distMap = new Map();
    for (const actor of allPartyActors) {
      distMap.set(actor.id, { actorName: actor.name, actorImg: actor.img, xp: 0, currency: [], items: [] });
    }

    // ── XP ──
    if (xp > 0 && preset.applyXP) {
      const share = xpEach ? xp : Math.floor(xp / count);
      if (share > 0) {
        for (const actor of actors) {
          await preset.applyXP(actor, share).catch(console.error);
          distMap.get(actor.id).xp += share;
        }
      }
    }

    // ── Currency ──
    if (preset.applyCurrency) {
      const share = {};
      for (const [key, amount] of Object.entries(currencies)) {
        if (!amount) continue;
        share[key] = splitCurrency ? Math.floor(amount / count) : amount;
      }
      if (Object.keys(share).length) {
        for (const actor of actors) {
          await preset.applyCurrency(actor, share).catch(console.error);
          for (const [key, amount] of Object.entries(share)) {
            if (amount > 0) {
              const label = currencyDef.find(c => c.key === key)?.label ?? key.toUpperCase();
              distMap.get(actor.id).currency.push({ label, amount });
            }
          }
        }
      }
    }

    // ── Items (per-item recipient dropdown) ──
    for (const rewardItem of items) {
      const recipientEl = this.element.querySelector(`.sqt-item-recipient[data-item-uuid="${rewardItem.uuid}"]`);
      const recipientId = recipientEl?.value ?? 'all';
      const itemActors  = recipientId === 'all'
        ? actors
        : allPartyActors.filter(a => a.id === recipientId);

      const source = await fromUuid(rewardItem.uuid).catch(() => null);
      if (!source) continue;

      for (const actor of itemActors) {
        const itemData = source.toObject();
        if (rewardItem.quantity != null && itemData.system?.quantity !== undefined) {
          itemData.system.quantity = rewardItem.quantity;
        }
        await actor.createEmbeddedDocuments('Item', [itemData]).catch(console.error);
        distMap.get(actor.id)?.items.push({
          name:     rewardItem.name,
          img:      rewardItem.img || 'icons/svg/item-bag.svg',
          quantity: rewardItem.quantity ?? 1,
        });
      }
    }

    // ── Chat card ──
    const distributions = [...distMap.values()]
      .filter(d => d.xp > 0 || d.currency.length || d.items.length);
    if (distributions.length) {
      await RewardDialog._postRewardCard(quest, distributions);
    }

    ui.notifications.info(
      game.i18n.format('QUESTTRACKER.Rewards.RewardsAppliedFull', { quest: quest.name, count })
    );
    this.close();
  }

  static async _postRewardCard(quest, distributions) {
    const xpLabel  = game.i18n.localize('QUESTTRACKER.Rewards.XP');
    const cardTitle = game.i18n.localize('QUESTTRACKER.Rewards.ChatCardTitle');

    const actorRows = distributions.map(dist => {
      const lines = [];
      if (dist.xp > 0)
        lines.push(`<li class="sqt-cc-xp"><i class="fas fa-star"></i> ${dist.xp} ${xpLabel}</li>`);
      for (const c of dist.currency)
        lines.push(`<li class="sqt-cc-currency"><i class="fas fa-coins"></i> ${c.amount} ${c.label}</li>`);
      for (const it of dist.items) {
        const qty = it.quantity > 1 ? ` ×${it.quantity}` : '';
        lines.push(`<li class="sqt-cc-item"><img src="${it.img}" class="sqt-cc-item-img">${it.name}${qty}</li>`);
      }
      return `<div class="sqt-cc-actor">
        <div class="sqt-cc-actor-name">
          <img src="${dist.actorImg}" class="sqt-cc-actor-img">
          <strong>${dist.actorName}</strong>
        </div>
        <ul class="sqt-cc-list">${lines.join('')}</ul>
      </div>`;
    });

    const content = `<div class="sqt-chat-card">
      <div class="sqt-cc-header">
        <img src="${quest.img || 'icons/svg/book.svg'}" class="sqt-cc-quest-img">
        <div>
          <h4 class="sqt-cc-title">${quest.name}</h4>
          <p class="sqt-cc-sub">${cardTitle}</p>
        </div>
      </div>
      <div class="sqt-cc-body">${actorRows.join('')}</div>
    </div>`;

    await ChatMessage.create({
      content,
      speaker: { alias: game.i18n.localize('QUESTTRACKER.Title') },
      flags: { [MODULE_ID]: { type: 'rewardSummary' } },
    });
  }

  /**
   * Apply XP immediately via Quest Tracker, then hand items + coins off to
   * Loot Roller's LotterySetupApp for the roll-off distribution flow.
   */
  static async _onSendToLootRoller(event, target) {
    const quest = QuestStore.get(this.questId);
    if (!quest) return this.close();

    const sysConfig = game.settings.get(MODULE_ID, SETTINGS.SYSTEM_CONFIG);
    const preset    = getSystemPreset(sysConfig.preset);

    // ── XP — distribute immediately, same as normal apply ──
    const checkedIds = new Set();
    this.element.querySelectorAll('.sqt-actor-check:checked').forEach(cb => checkedIds.add(cb.dataset.actorId));
    const actors = getPartyActors().filter(a => checkedIds.has(a.id));
    const xpEach = this.element.querySelector('#sqt-xp-each')?.checked ?? true;
    const xp     = quest.rewards?.xp ?? 0;

    if (xp > 0 && preset.applyXP && actors.length) {
      const share = xpEach ? xp : Math.floor(xp / actors.length);
      if (share > 0) {
        for (const actor of actors) {
          await preset.applyXP(actor, share).catch(console.error);
        }
      }
    }

    // ── Items — resolve UUIDs to full Item documents for the lottery ──
    const rawItems     = quest.rewards?.items ?? [];
    const resolvedItems = [];
    for (const rewardItem of rawItems) {
      const item = await fromUuid(rewardItem.uuid).catch(() => null);
      if (item) {
        resolvedItems.push(item);
      } else {
        // Pass a minimal stub so the setup app can still display it
        resolvedItems.push({ name: rewardItem.name, img: rewardItem.img, stub: true });
      }
    }

    // ── Coins — pass the full totals; Loot Roller handles distribution mode ──
    const coins = {};
    for (const [key, amount] of Object.entries(quest.rewards?.currency ?? {})) {
      if (amount > 0) coins[key] = amount;
    }

    window.LootRoller.startLottery({ items: resolvedItems, coins });
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
