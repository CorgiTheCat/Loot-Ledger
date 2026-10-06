import OBR from '@owlbear-rodeo/sdk';

import { buildLootDistribution, normalizeEntry, selectDiceType, RARITIES, rarityInfo } from './systems/LootEngine.js';

import { OwlbearLootAdapter } from './adapters/OwlbearLootAdapter.js';

import { Dice3D } from './components/Dice3D.js';

import { DddiceDice } from './components/DddiceDice.js';

import { LOOT_KEY } from './constants.js';
import { PresetStore } from './systems/PresetStore.js';

import { DEFAULT_APPEARANCE, DICE_FONTS, DICE_MATERIALS, DICE_PATTERNS, DICE_PALETTE, normalizeAppearance, readAppearance, saveAppearance } from './systems/DiceAppearance.js';
import './style.css';



const app = document.querySelector('#app');

const CURRENCIES = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

const uid = () => crypto.randomUUID();

let adapter, token, role = 'PLAYER', session = null, draft = [], mode = 'normal';

let rolling = false, adminBusy = false, revealVisible = false, rollResult = null, dice = null;

let notice = '', unsubscribe = null;

let modifierText = '0';
let diceAppearance = normalizeAppearance(), appearanceDraft = normalizeAppearance();
let appearanceOpen = false, appearancePreview = null, appearancePlayerId = '';
const providerPreferenceKey = 'loot-ledger/dice-provider';
let presetStore = null, presets = [], selectedPresetId = '', presetName = '', presetError = '';
let draftBeforePreset = null, deletedPreset = null;

const signed = (value) => value > 0 ? `+${value}` : String(value);

function readModifier() {

  if (!/^[+-]?\d+$/.test(modifierText.trim())) throw new Error('Enter a whole-number modifier.');

  const value = Number(modifierText);

  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(value + 20)) throw new Error('That modifier is too large to calculate accurately.');

  return value;

}

function rollEquation(result) {
  if (result.noLoot) return 'Natural 1 · No loot · Bonus ignored';

  const base = result.baseRoll ?? result.finalRoll;

  const bonus = result.modifier ?? 0;

  const total = result.totalRoll ?? result.finalRoll;

  return `${base} ${bonus < 0 ? '−' : '+'} ${Math.abs(bonus)} = ${total}${total !== result.finalRoll ? ` · Loot table ${result.finalRoll}` : ''}`;

}

function modifierView() {

  return `<div class="modifier-control"><label for="roll-modifier">Roll modifier</label><div class="modifier-stepper" role="group" aria-label="Roll modifier"><button type="button" data-action="modifier-minus" aria-label="Decrease modifier" ${rolling ? 'disabled' : ''}>−</button><input id="roll-modifier" type="text" inputmode="numeric" autocomplete="off" aria-describedby="modifier-help" value="${esc(modifierText)}" ${rolling ? 'disabled' : ''}><button type="button" data-action="modifier-plus" aria-label="Increase modifier" ${rolling ? 'disabled' : ''}>+</button></div><p id="modifier-help">Add your sheet bonus after the roll. A natural 1 gives no loot, regardless of bonus. Other totals use the nearest value from 2–D${session.diceType}.</p></div>`;

}

let diceKind = 'built-in', dddiceSettingsOpen = false;

const diceSettings = {

  room: localStorage.getItem('loot-ledger/dddice-room') || '',

  apiKey: sessionStorage.getItem('loot-ledger/dddice-key') || '',

  passcode: sessionStorage.getItem('loot-ledger/dddice-passcode') || '',

};

if (diceSettings.room && diceSettings.apiKey) diceKind = 'dddice';
if (localStorage.getItem(providerPreferenceKey) === 'built-in') diceKind = 'built-in';



function draftKey() { return `com.corgi.loot-ledger/draft/${token.id}`; }

function readDraft() {

  try { return JSON.parse(localStorage.getItem(draftKey()) || '[]').map(normalizeEntry); }

  catch { return []; }

}

function saveDraft() { localStorage.setItem(draftKey(), JSON.stringify(draft)); }

function inStock(entries) { return entries.filter((entry) => entry.weight > 0); }

function hasRollableLoot(entries) { return entries.some((entry) => entry.weight > 0); }

function alertUser(message) { notice = message; render(); setTimeout(() => { if (notice === message) { notice = ''; render(); } }, 4000); }



function rarityBadge(value) {

  const rarity = rarityInfo(value);

  return `<span class="rarity-badge rarity-${rarity.id}">${rarity.label}</span>`;

}



function tableRows(entries, sides) {

  if (!sides || !hasRollableLoot(entries)) return '<p class="empty-state">Add an entry with a positive drop rate to preview the odds.</p>';

  const ranges = buildLootDistribution(sides, entries);

  const assigned = new Set(ranges.map((range) => range.lootId));

  const row = (entry, range) => `<div class="chance-row"><span class="roll-range">${range ? `${range.minRoll}${range.minRoll === range.maxRoll ? '' : `–${range.maxRoll}`}` : '—'}</span><span class="chance-item"><b>${esc(entry.emoji)} ${esc(entry.name)}</b>${rarityBadge(entry.rarity)}<small>${range ? `${range.faces} face${range.faces === 1 ? '' : 's'}` : 'No face assigned'}</small></span><span class="chance-pct">${range ? `${(range.probability * 100).toFixed(range.probability * 100 % 1 ? 1 : 0)}%` : '0%'}</span></div>`;

  return '<div class="chance-row"><span class="roll-range">1</span><span class="chance-item"><b>No loot</b><small>Natural 1 · Bonuses cannot prevent this</small></span><span class="chance-pct">5%</span></div>' + ranges.map((range) => row(entries.find((entry) => entry.id === range.lootId), range)).join('')

    + entries.filter((entry) => entry.weight > 0 && !assigned.has(entry.id)).map((entry) => row(entry, null)).join('');

}



function entryCard(entry, index) {

  const money = entry.type === 'money';

  return `<article class="item-row" data-entry="${esc(entry.id)}"><div class="item-icon">${esc(entry.emoji)}</div><div class="item-fields"><div class="field-line"><input aria-label="Item name" data-key="name" value="${esc(entry.name)}" maxlength="80" placeholder="Item name"><input class="emoji-field" aria-label="Emoji" data-key="emoji" value="${esc(entry.emoji)}" maxlength="8"></div><div class="field-line compact"><select aria-label="Loot type" data-key="type"><option value="item" ${!money ? 'selected' : ''}>Item</option><option value="money" ${money ? 'selected' : ''}>Money</option></select><input aria-label="Item category" data-key="category" value="${esc(entry.category)}" maxlength="80" placeholder="Category"><label class="number-field"><span>Rate</span><input type="number" min="0" step="any" aria-label="Drop rate" data-key="weight" value="${entry.weight}"></label></div><label class="rarity-field">Drop rarity · DM only<select aria-label="Drop rarity" data-key="rarity">${RARITIES.map((rarity) => `<option value="${rarity.id}" ${rarity.id === (entry.rarity || 'common') ? 'selected' : ''}>${rarity.label}</option>`).join('')}</select></label>${money ? `<div class="field-line compact money-fields"><select aria-label="Currency" data-key="currency">${Object.entries(CURRENCIES).map(([code, name]) => `<option value="${code}" ${code === entry.currency ? 'selected' : ''}>${name}</option>`).join('')}</select><label class="number-field"><span>Min</span><input type="number" min="0" step="1" data-key="minAmount" value="${entry.minAmount}"></label><label class="number-field"><span>Max</span><input type="number" min="0" step="1" data-key="maxAmount" value="${entry.maxAmount}"></label></div>` : ''}<textarea aria-label="Description" data-key="description" rows="1" maxlength="500" placeholder="Optional description">${esc(entry.description)}</textarea></div><div class="row-actions"><button class="icon-btn" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move up">↑</button><button class="icon-btn" data-move="1" ${index === draft.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button><button class="icon-btn danger" data-remove aria-label="Remove item">×</button></div></article>`;

}



function historyView() {

  const history = session?.rollHistory || [];

  return `<section class="panel history-panel"><div class="panel-heading"><div><div class="eyebrow">SESSION RECORD</div><h2>Roll history</h2></div><span class="status-chip">${history.length} rolls</span></div>${history.length ? `<div class="history-table"><div class="history-head"><span>Player</span><span>Mode · Roll</span><span>Loot</span><span>Time</span></div>${history.slice().reverse().map((roll) => `<div class="history-row"><b>${esc(roll.playerName)}</b><span>${roll.rollMode.toUpperCase()} · ${roll.rawRolls.join(', ')} → ${rollEquation(roll)}</span><span>${esc(roll.emoji)} ${esc(roll.lootName)} ${roll.noLoot ? '' : rarityBadge(roll.rarity)} ${roll.noLoot ? '' : roll.itemType === 'money' ? `+${roll.quantityReceived} ${esc(roll.currency.toUpperCase())}` : '×1'}</span><time>${new Date(roll.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('')}</div>` : '<div class="empty-state history-empty">Completed player rolls will appear here.</div>'}</section>`;

}



function refreshPresets() {
  try {
    presets = presetStore ? presetStore.list() : [];
    presetError = '';
    if (!presets.some((preset) => preset.id === selectedPresetId)) selectedPresetId = '';
  } catch (error) { presetError = error.message; presets = []; }
}

function presetView(active) {
  const selected = presets.find((preset) => preset.id === selectedPresetId);
  const unavailable = !presetStore || !!presetError;
  return `<section class="preset-panel" aria-labelledby="preset-heading"><div class="eyebrow">DM PRESETS</div><h3 id="preset-heading">Your loot library</h3><p class="hint">Save a loot pool and reuse it on any token. Presets stay in this browser on this website.</p><label class="field-label">Saved preset<select id="preset-select" ${unavailable ? 'disabled' : ''}><option value="">Choose a preset</option>${presets.map((preset) => `<option value="${esc(preset.id)}" ${preset.id === selectedPresetId ? 'selected' : ''}>${esc(preset.name)} (${preset.entries.length} drops)</option>`).join('')}</select></label><div class="preset-actions"><button class="secondary" data-action="preset-load" ${!selected || active || unavailable ? 'disabled' : ''}>Load into this token</button><button class="ghost" data-action="preset-delete" ${!selected || unavailable ? 'disabled' : ''}>Delete selected</button>${deletedPreset ? '<button class="ghost" data-action="preset-restore">Undo delete</button>' : ''}${draftBeforePreset && !active ? '<button class="ghost" data-action="preset-undo-load">Undo load</button>' : ''}</div><label class="field-label">Preset name<input id="preset-name" value="${esc(presetName)}" maxlength="80" placeholder="e.g. Goblin Camp"></label><div class="preset-actions"><button class="secondary" data-action="preset-save" ${unavailable ? 'disabled' : ''}>Save as new preset</button><button class="ghost" data-action="preset-update" ${!selected || unavailable ? 'disabled' : ''}>Update selected</button></div><p class="hint">${active ? 'The active session can be saved as a preset. Close it before loading another pool.' : 'Loading replaces this token’s draft. Adjust it, then begin a session. Changes do not alter the saved preset unless you update it.'}</p>${presetError ? `<p class="preset-error" role="alert">${esc(presetError)}</p>` : ''}</section>`;
}

function handlePresetAction(action) {
  if (role !== 'GM' || !presetStore) return;
  const active = session?.status === 'active';
  try {
    if (action === 'preset-save' || action === 'preset-update') {
      const preset = presetStore.save({
        id: action === 'preset-update' ? selectedPresetId : undefined,
        name: presetName,
        poolName: active ? session.name : (document.querySelector('#pool-name')?.value || token.name || 'Loot Cache'),
        entries: active ? session.lootEntries : draft,
      });
      selectedPresetId = preset.id; presetName = preset.name;
      refreshPresets(); alertUser(`Preset "${preset.name}" saved.`);
    } else if (action === 'preset-load') {
      if (active) throw new Error('Close the active session before loading a preset.');
      const loaded = presetStore.load(selectedPresetId);
      const before = { entries: structuredClone(draft), name: localStorage.getItem(draftKey() + '/name') };
      localStorage.setItem(draftKey(), JSON.stringify(loaded.entries));
      localStorage.setItem(draftKey() + '/name', loaded.poolName);
      draft = loaded.entries; draftBeforePreset = before;
      alertUser('Preset loaded into this token. Adjust it, then begin a session.');
    } else if (action === 'preset-undo-load') {
      if (active || !draftBeforePreset) return;
      localStorage.setItem(draftKey(), JSON.stringify(draftBeforePreset.entries));
      if (draftBeforePreset.name === null) localStorage.removeItem(draftKey() + '/name');
      else localStorage.setItem(draftKey() + '/name', draftBeforePreset.name);
      draft = draftBeforePreset.entries; draftBeforePreset = null;
      alertUser('Previous draft restored.');
    } else if (action === 'preset-delete') {
      deletedPreset = presetStore.remove(selectedPresetId);
      selectedPresetId = ''; presetName = '';
      refreshPresets(); alertUser('Preset deleted. Use Undo delete to restore it.');
    } else if (action === 'preset-restore' && deletedPreset) {
      const restored = presetStore.restore(deletedPreset);
      selectedPresetId = restored.id; presetName = restored.name; deletedPreset = null;
      refreshPresets(); alertUser('Preset restored.');
    }
  } catch (error) { alertUser(error.message); }
}

function dmView() {

  const active = session?.status === 'active';

  const entries = active ? session.lootEntries : draft;

  const sides = active ? session.diceType : selectDiceType(draft);

  return `<section class="dm-layout"><div class="panel editor-panel"><div class="panel-heading"><div><div class="eyebrow">THE DM'S LEDGER</div><h2>${active ? 'Session in progress' : 'Build a loot pool'}</h2><p>${active ? `${esc(session.name)} · D20 loot session` : `Create treasure for ${esc(token.name || 'this token')}.`}</p></div><span class="status-chip ${active ? 'active' : ''}">${active ? 'ACTIVE' : `${inStock(entries).length} enabled`}</span></div>${presetView(active)}${active ? `<div class="session-tools"><button class="secondary" data-action="close-session">Close Session</button></div><div class="locked-note">Every loot roll uses a D20. Drops repeat without a stock limit; only DM rates determine the odds.</div>` : `<label class="field-label">Loot cache name<input id="pool-name" maxlength="80" value="${esc(localStorage.getItem(draftKey() + '/name') || token.name || 'Loot Cache')}"></label><div class="entry-list">${draft.map(entryCard).join('')}</div><div class="add-actions"><button class="secondary" data-action="add-item">＋ Add item</button><button class="ghost" data-action="add-money">＋ Add money</button></div><div class="dm-footer"><span class="hint">Drop rates are relative: 10 is twice as likely as 5 before D20 rounding. Rate 0 disables an item. Drops never run out.</span><button class="primary" data-action="start-session" ${hasRollableLoot(draft) ? '' : 'disabled'}>Begin Loot Session ↗</button></div>`}</div><aside class="panel odds-panel"><div class="eyebrow">DM-ONLY ODDS</div><h3>${sides ? `D${sides} loot table` : 'Your loot table'}</h3><p class="subcopy">Only DM drop rates determine the odds. Rarity is a label. D20 rounds chances to 5% steps; up to 19 enabled items receive at least one face each. Natural 1 always gives no loot. The table shows Normal-roll odds at modifier +0; Advantage and Disadvantage change these chances.</p>${tableRows(entries, sides)}${inStock(entries).length > 19 ? '<p class="hint">Only 19 D20 faces award loot; entries shown at 0% cannot be rolled until the pool changes.</p>' : ''}</aside></section>${historyView()}`;

}



function appearanceView() {
  const options = (list, key) => list.map((item) => `<option value="${item.id}" ${appearanceDraft[key] === item.id ? 'selected' : ''}>${item.name}</option>`).join('');
  return `<section class="dice-customizer" id="dice-customizer" aria-labelledby="dice-style-title"><header><div><div class="eyebrow">YOUR DICE</div><h3 id="dice-style-title">Customize dice</h3></div><button class="text-button" data-action="dice-style-cancel">Close</button></header><p>Choose your look, preview it, then save. These styles use Built-in dice.</p><div class="dice-customizer-grid"><div class="dice-customizer-preview"><div id="appearance-preview" aria-label="Dice appearance preview"></div><span id="dice-font-sample" style="font-family:${esc(DICE_FONTS.find(item => item.id === appearanceDraft.font).family)};color:${appearanceDraft.numberColor}">1 &nbsp; 7 &nbsp; 20</span><small>Live preview</small></div><div class="dice-style-fields"><label>Dice color<input type="color" data-dice-style="bodyColor" value="${appearanceDraft.bodyColor}"></label><div class="dice-color-swatches" role="group" aria-label="Dice color palette">${DICE_PALETTE.map(([name, color]) => `<button type="button" data-action="dice-style-color" data-color="${color}" style="background:${color}" title="${name}" aria-label="${name} dice color" aria-pressed="${appearanceDraft.bodyColor === color}"></button>`).join('')}</div><div class="dice-style-color-row"><label>Number color<input type="color" data-dice-style="numberColor" value="${appearanceDraft.numberColor}"></label><label>Edge color<input type="color" data-dice-style="edgeColor" value="${appearanceDraft.edgeColor}"></label></div><label>Number font<select data-dice-style="font">${options(DICE_FONTS, 'font')}</select></label><label>Material<select data-dice-style="material">${options(DICE_MATERIALS, 'material')}</select></label><label>Pattern<select data-dice-style="pattern">${options(DICE_PATTERNS, 'pattern')}</select></label><fieldset class="dice-pattern-options" ${appearanceDraft.pattern === 'none' ? 'disabled' : ''}><label>Pattern color<input type="color" data-dice-style="patternColor" value="${appearanceDraft.patternColor}"></label><label>Pattern size <output id="dice-pattern-scale-value">${Math.round(appearanceDraft.patternScale * 100)}%</output><input type="range" min="0.25" max="4" step="0.05" data-dice-style="patternScale" value="${appearanceDraft.patternScale}"></label></fieldset><small class="hint">Choose a pattern to adjust its color and size.</small><label>Metallic <output id="dice-metalness-value">${Math.round(appearanceDraft.metalness * 100)}%</output><input type="range" min="0" max="1" step="0.01" data-dice-style="metalness" value="${appearanceDraft.metalness}"></label><label>Surface roughness <output id="dice-roughness-value">${Math.round(appearanceDraft.roughness * 100)}%</output><input type="range" min="0" max="1" step="0.01" data-dice-style="roughness" value="${appearanceDraft.roughness}"></label></div></div><div class="dice-style-actions"><button class="secondary" data-action="dice-style-save">Save &amp; use dice</button><button class="ghost" data-action="dice-style-reset">Reset preview</button><button class="ghost" data-action="dice-style-cancel">Cancel</button></div><p class="hint">Saved for your player in this browser and website. Material settings change appearance; drop rates are controlled by the DM.</p></section>`;
}

function updateAppearancePreview(key, value) {
  let change = { [key]: value };
  if (key === 'material') {
    const material = DICE_MATERIALS.find(item => item.id === value);
    if (!material) return;
    change = { material: value, metalness: material.metalness, roughness: material.roughness };
  }
  appearanceDraft = normalizeAppearance({ ...appearanceDraft, ...change });
  appearancePreview?.setAppearance(appearanceDraft);
  const patternOptions = document.querySelector('.dice-pattern-options');
  if (patternOptions) patternOptions.disabled = appearanceDraft.pattern === 'none';
  const patternSize = document.querySelector('#dice-pattern-scale-value');
  if (patternSize) patternSize.textContent = `${Math.round(appearanceDraft.patternScale * 100)}%`;
  document.querySelectorAll('[data-dice-style]').forEach((field) => { field.value = appearanceDraft[field.dataset.diceStyle]; });
  for (const property of ['metalness', 'roughness']) {
    const output = document.querySelector(`#dice-${property}-value`);
    if (output) output.textContent = `${Math.round(appearanceDraft[property] * 100)}%`;
  }
  const sample = document.querySelector('#dice-font-sample');
  if (sample) {
    sample.style.fontFamily = DICE_FONTS.find(item => item.id === appearanceDraft.font).family;
    sample.style.color = appearanceDraft.numberColor;
  }
  document.querySelectorAll('[data-action="dice-style-color"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === appearanceDraft.bodyColor)));
}

function playerView() {

  if (session?.status !== 'active') return `<section class="player-idle panel"><div class="sigil">✧</div><div class="eyebrow">THE CACHE IS SEALED</div><h2>No active loot session</h2><p>Ask the DM to open a loot cache on this token.</p></section>`;

  const depleted = !buildLootDistribution(session.diceType, session.lootEntries).length;

  const values = rollResult?.rawRolls || [];

  const winning = rollResult?.rollMode === 'adv' ? Math.max(...values) : rollResult?.rollMode === 'dis' ? Math.min(...values) : values[0];

  return `<section class="roll-screen"><div class="roll-top"><div><div class="eyebrow">TREASURE CLAIM</div><h2>${esc(session.name)}</h2></div><div class="die-badge">D${session.diceType}<small>${inStock(session.lootEntries).length} enabled</small></div></div><button type="button" class="dice-customize-button" data-action="dice-style-open" aria-expanded="${appearanceOpen}" aria-controls="dice-customizer" ${rolling ? 'disabled' : ''}><svg class="dice-customize-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4l-.4-.4a1.2 1.2 0 0 1 .9-2H17a4 4 0 0 0 4-4c0-4.4-4-8.2-9-8.2Z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10.5" cy="6.8" r="1"/><circle cx="15" cy="7.5" r="1"/><circle cx="17.5" cy="11" r="1"/></svg><span class="dice-customize-copy"><strong>Customize dice</strong><small>Colors, patterns, fonts &amp; materials</small></span><span class="dice-customize-arrow" aria-hidden="true">⌄</span></button><div class="dice-stage"><div class="stage-glow"></div><div class="die-host" id="die-host"></div><div class="roll-readout ${rollResult ? 'visible' : ''}">${values.map((value) => `<span class="die-number ${rollResult.rollMode !== 'normal' && value !== winning ? 'dimmed' : ''}">${value}</span>`).join(values.length > 1 ? '<i>·</i>' : '')}${rollResult ? `<small>${rollEquation(rollResult)} · ${rollResult.rollMode.toUpperCase()}</small>` : ''}</div></div><p class="roll-instruction">${depleted ? 'No drops are enabled.' : rolling ? 'The fates are turning…' : 'Touch the die to cast your roll.'}</p>${modifierView()}<button class="roll-button" data-action="roll" ${rolling || depleted ? 'disabled' : ''}>${depleted ? 'NO DROPS ENABLED' : rolling ? 'ROLLING…' : 'ROLL DICE'}</button><div class="roll-modes">${[['normal', 'NORMAL'], ['adv', 'ADVANTAGE'], ['dis', 'DISADVANTAGE']].map(([value, label]) => `<button class="mode-button ${mode === value ? 'selected' : ''}" data-mode="${value}" ${rolling ? 'disabled' : ''}>${label}</button>`).join('')}</div><div class="dice-provider"><span>Dice display: ${diceKind === 'dddice' ? 'dddice' : 'Built-in'}</span><button class="text-button" data-action="dice-settings">Settings</button></div>${appearanceOpen ? appearanceView() : ''}${dddiceSettingsOpen ? `<div class="dddice-settings"><p>Connect to the same dddice room used in Owlbear. Your API key stays in this browser tab.</p><label>Room slug<input id="dddice-room" value="${esc(diceSettings.room)}" placeholder="your-room-slug"></label><label>API key<input id="dddice-key" type="password" placeholder="${diceSettings.apiKey ? 'Saved for this tab' : 'Paste your dddice API key'}" autocomplete="off"></label><label>Room passcode (optional)<input id="dddice-passcode" type="password" placeholder="${diceSettings.passcode ? 'Saved for this tab' : 'Only for private rooms'}" autocomplete="off"></label><div><button class="secondary" data-action="save-dddice">Use dddice</button><button class="ghost" data-action="built-in-dice">Use built-in dice</button></div></div>` : ''}<div class="player-footer">Rolls are resolved by the DM's Owlbear session.</div>${rollResult ? `<div class="loot-reveal"><div class="eyebrow">${rollResult.noLoot ? 'EMPTY HANDED' : 'LOOT ACQUIRED'}</div><p class="result-equation">${rollEquation(rollResult)}</p><div class="result-emoji">${esc(rollResult.emoji)}</div><h3>${esc(rollResult.lootName)}</h3>${rollResult.noLoot ? '' : rarityBadge(rollResult.rarity)}<strong>${rollResult.noLoot ? 'No items or currency received' : rollResult.itemType === 'money' ? `+${rollResult.quantityReceived} ${esc(rollResult.currency.toUpperCase())}` : '×1'}</strong>${rollResult.description ? `<p>${esc(rollResult.description)}</p>` : ''}<button class="secondary" data-action="continue">CONTINUE</button></div>` : ''}</section>`;

}



function render() {

  if (!token) { app.innerHTML = '<div class="loading">Opening the loot ledger…</div>'; return; }

  app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><img class="brand-icon" src="/loot-icon.png" alt="Loot Ledger"><span><b>LOOT LEDGER</b><small>OWLBEAR RODEO</small></span></div><span class="status-chip">${role === 'GM' ? 'DM' : 'PLAYER'} · ${esc(token.name || 'Token')}</span></header><main><div class="workspace-head"><div><div class="eyebrow">LOOT LEDGER <span>•</span> OWLBEAR RODEO</div><h1>${role === 'GM' ? 'Treasure, by the roll.' : 'The cache awaits.'}</h1><p>${role === 'GM' ? 'Shape the cache and open a session for your players.' : 'Choose how fate favors you, then roll for treasure.'}</p></div>${session?.status === 'active' ? `<div class="session-pill live"><span></span>SESSION OPEN · D${session.diceType}</div>` : ''}</div>${role === 'GM' ? dmView() : playerView()}<footer>LOOT LEDGER · OWLBEAR RODEO · Created by CorgiTheCat</footer></main>${notice ? `<div class="toast show" role="alert">${esc(notice)}</div>` : '<div class="toast"></div>'}</div>`;

  if (revealVisible) document.querySelector('.loot-reveal')?.classList.add('revealed');

  const host = document.querySelector('#die-host');

  if (host) {

    try {

      if (dice && dice.provider !== diceKind) { dice.dispose(); dice = null; }

      if (!dice) {

        dice = diceKind === 'dddice' ? new DddiceDice(host, diceSettings) : new Dice3D(host, diceAppearance);

        dice.provider = diceKind;

      } else dice.attach(host);

      if (dice.provider === 'built-in') dice.setAppearance(diceAppearance);
      dice.setDie(session.diceType, mode === 'normal' ? 1 : 2);

    } catch (error) {

      dice?.dispose(); dice = null; diceKind = 'built-in';

      try { dice = new Dice3D(host, diceAppearance); dice.provider = 'built-in'; dice.setDie(session.diceType, mode === 'normal' ? 1 : 2); }

      catch { host.textContent = '3D dice could not start in this browser.'; }

      console.error(error);

    }

  } else if (dice) { dice.dispose(); dice = null; }
  const previewHost = document.querySelector('#appearance-preview');
  if (previewHost) {
    try {
      if (!appearancePreview) appearancePreview = new Dice3D(previewHost, appearanceDraft);
      else { appearancePreview.attach(previewHost); appearancePreview.setAppearance(appearanceDraft); }
      appearancePreview.setDie(20, 1);
    } catch { appearancePreview?.dispose(); appearancePreview = null; previewHost.textContent = 'Preview unavailable. Your style can still be saved.'; }
  } else { appearancePreview?.dispose(); appearancePreview = null; }

}



function addEntry(input) { draft.push(normalizeEntry({ id: uid(), weight: 1, ...input }, draft.length)); saveDraft(); render(); }

async function roll() {

  if (rolling || role === 'GM' || session?.status !== 'active') return;

  let modifier;

  try { modifier = readModifier(); } catch (error) { alertUser(error.message); return; }

  rolling = true; rollResult = null; revealVisible = false; render();

  try {

    const result = await adapter.rollLoot(mode, modifier);

    try { await dice?.rollTo(result.rawRolls, mode); }

    catch (diceError) {

      console.error(diceError);

      diceKind = 'built-in';

      dice?.dispose(); dice = null;

      const host = document.querySelector('#die-host');

      if (host) { dice = new Dice3D(host, diceAppearance); dice.provider = 'built-in'; dice.setDie(session.diceType, mode === 'normal' ? 1 : 2); await dice.rollTo(result.rawRolls, mode); }

      notice = 'dddice could not connect. Showing the same roll locally.';

    }

    await new Promise((resolve) => setTimeout(resolve, diceKind === 'dddice' ? 1100 : 300));

    rolling = false; rollResult = result; render();

    setTimeout(() => { revealVisible = true; document.querySelector('.loot-reveal')?.classList.add('revealed'); }, 80);

  } catch (error) { rolling = false; render(); alertUser(error.message); }

}



app.addEventListener('click', async (event) => {

  if (event.target.closest('#die-host')) { roll(); return; }

  const button = event.target.closest('button'); if (!button) return;

  if (button.dataset.mode) { if (!rolling) { mode = button.dataset.mode; render(); } return; }

  const action = button.dataset.action;

  if (role !== 'GM' && !['roll', 'continue', 'dice-settings', 'save-dddice', 'built-in-dice', 'modifier-minus', 'modifier-plus', 'dice-style-open', 'dice-style-save', 'dice-style-cancel', 'dice-style-reset', 'dice-style-color'].includes(action)) return;

  if (action?.startsWith('dice-style-')) {
    if (rolling) return;
    if (action === 'dice-style-open') {
      appearanceDraft = { ...diceAppearance }; appearanceOpen = !appearanceOpen; render();
      if (appearanceOpen) document.querySelector('#dice-customizer')?.scrollIntoView({ block: 'start' });
    }
    if (action === 'dice-style-cancel') { appearanceOpen = false; appearanceDraft = { ...diceAppearance }; render(); }
    if (action === 'dice-style-color') updateAppearancePreview('bodyColor', button.dataset.color);
    if (action === 'dice-style-reset') { appearanceDraft = { ...DEFAULT_APPEARANCE }; updateAppearancePreview('font', appearanceDraft.font); }
    if (action === 'dice-style-save') {
      try {
        if (!appearancePlayerId) throw new Error('Your player settings are not ready.');
        diceAppearance = saveAppearance(localStorage, appearancePlayerId, appearanceDraft);
        localStorage.setItem(providerPreferenceKey, 'built-in');
        diceKind = 'built-in'; appearanceOpen = false;
        alertUser('Your dice style is saved.');
      } catch (error) { alertUser(error.message); }
    }
    return;
  }
  if (action?.startsWith('preset-')) { handlePresetAction(action); return; }

  if (action === 'add-item') addEntry({ name: 'New Loot', emoji: '📦', category: 'Adventuring Gear' });

  if (action === 'add-money') addEntry({ name: 'Gold', emoji: '🪙', type: 'money', category: 'Currency', currency: 'gp', minAmount: 5, maxAmount: 20 });

  if (button.hasAttribute('data-remove')) { draft = draft.filter((entry) => entry.id !== button.closest('[data-entry]').dataset.entry); saveDraft(); render(); }

  if (button.dataset.move) { const index = draft.findIndex((entry) => entry.id === button.closest('[data-entry]').dataset.entry), target = index + Number(button.dataset.move); if (target >= 0 && target < draft.length) [draft[index], draft[target]] = [draft[target], draft[index]]; saveDraft(); render(); }

  if (action === 'start-session' && !adminBusy) { adminBusy = true; button.disabled = true; try { const name = document.querySelector('#pool-name').value.trim(); localStorage.setItem(draftKey() + '/name', name); session = await adapter.createSession(name, draft); render(); alertUser(`D20 loot session is ready.`); } catch (error) { alertUser(error.message); } finally { adminBusy = false; } }

  if (action === 'close-session' && !adminBusy) { adminBusy = true; button.disabled = true; try { session = await adapter.closeSession(); render(); } catch (error) { alertUser(error.message); } finally { adminBusy = false; } }

  if (action === 'modifier-minus' || action === 'modifier-plus') {

    if (rolling) return;

    try {

      const next = readModifier() + (action === 'modifier-plus' ? 1 : -1);

      if (!Number.isSafeInteger(next) || !Number.isSafeInteger(next + 20)) throw new Error('That modifier is too large to calculate accurately.');

      modifierText = signed(next);

      document.querySelector('#roll-modifier').value = modifierText;

    } catch (error) { alertUser(error.message); }

    return;

  }

  if (action === 'roll') roll();

  if (action === 'dice-settings') { dddiceSettingsOpen = !dddiceSettingsOpen; render(); }

  if (action === 'save-dddice') {

    const room = document.querySelector('#dddice-room')?.value.trim() || '';

    const apiKey = document.querySelector('#dddice-key')?.value.trim() || diceSettings.apiKey;

    const passcode = document.querySelector('#dddice-passcode')?.value.trim() || diceSettings.passcode;

    if (!room || !apiKey) { alertUser('Enter the dddice room slug and API key.'); return; }

    Object.assign(diceSettings, { room, apiKey, passcode });

    localStorage.setItem('loot-ledger/dddice-room', room);

    sessionStorage.setItem('loot-ledger/dddice-key', apiKey);

    sessionStorage.setItem('loot-ledger/dddice-passcode', passcode);

    localStorage.setItem(providerPreferenceKey, 'dddice');
    diceKind = 'dddice'; dddiceSettingsOpen = false; render();

  }

  if (action === 'built-in-dice') { localStorage.setItem(providerPreferenceKey, 'built-in'); diceKind = 'built-in'; dddiceSettingsOpen = false; render(); }

  if (action === 'continue') { rollResult = null; revealVisible = false; render(); }

});



app.addEventListener('input', (event) => {
  if (event.target.dataset.diceStyle && !rolling) {
    const key = event.target.dataset.diceStyle;
    updateAppearancePreview(key, ['metalness', 'roughness', 'patternScale'].includes(key) ? Number(event.target.value) : event.target.value); return;
  }
  if (role === 'GM' && event.target.id === 'preset-name') presetName = event.target.value;
  if (role === 'GM' && session?.status !== 'active' && event.target.id === 'pool-name') localStorage.setItem(draftKey() + '/name', event.target.value);

  if (event.target.id === 'roll-modifier' && !rolling) modifierText = event.target.value;

});



app.addEventListener('change', (event) => {
  if (event.target.dataset.diceStyle && !rolling) {
    const key = event.target.dataset.diceStyle;
    updateAppearancePreview(key, ['metalness', 'roughness', 'patternScale'].includes(key) ? Number(event.target.value) : event.target.value); return;
  }
  if (role === 'GM' && event.target.id === 'preset-select') {
    selectedPresetId = event.target.value;
    presetName = presets.find((preset) => preset.id === selectedPresetId)?.name || '';
    render(); return;
  }

  if (event.target.id === 'roll-modifier') {

    if (rolling) return;

    try { modifierText = signed(readModifier()); event.target.value = modifierText; }

    catch (error) { alertUser(error.message); }

    return;

  }

  const field = event.target.closest('[data-key]'); if (!field || role !== 'GM' || session?.status === 'active') return;

  const entry = draft.find((item) => item.id === field.closest('[data-entry]').dataset.entry); if (!entry) return;

  const key = field.dataset.key;

  const value = ['weight', 'minAmount', 'maxAmount'].includes(key) ? Number(field.value) : field.value;

  const changed = { ...entry, [key]: value };

  if (key === 'type' && value === 'money') Object.assign(changed, { currency: 'gp', minAmount: 5, maxAmount: 20 });

  try { draft[draft.indexOf(entry)] = normalizeEntry(changed); saveDraft(); render(); }

  catch (error) { render(); alertUser(error.message); }

});



OBR.onReady(async () => {

  try {

    const tokenId = new URLSearchParams(location.search).get('token');

    if (!tokenId) throw new Error('Open Loot from a token in the Owlbear scene.');

    adapter = new OwlbearLootAdapter(tokenId);

    role = await OBR.player.getRole();

    token = await adapter.getToken();

    session = token.metadata?.[LOOT_KEY] ? { ...token.metadata[LOOT_KEY], diceType: 20 } : null;

    draft = readDraft();
    appearancePlayerId = await OBR.player.getId();
    diceAppearance = readAppearance(localStorage, appearancePlayerId);
    appearanceDraft = { ...diceAppearance };
    presetStore = new PresetStore(localStorage, appearancePlayerId);
    refreshPresets();

    unsubscribe = adapter.subscribeToSession((nextSession, nextToken) => {

      session = nextSession ? { ...nextSession, diceType: 20 } : null; if (nextToken) token = nextToken; render();

    });

    OBR.player.onChange(async () => { role = await OBR.player.getRole(); render(); });

    render();

  } catch (error) { app.innerHTML = `<section class="player-idle panel"><h2>Loot unavailable</h2><p>${esc(error.message)}</p></section>`; }

});



window.addEventListener('beforeunload', () => { unsubscribe?.(); dice?.dispose(); appearancePreview?.dispose(); });


window.addEventListener('storage', (event) => {
  if (presetStore && event.key === presetStore.key && role === 'GM') { refreshPresets(); render(); }
});
